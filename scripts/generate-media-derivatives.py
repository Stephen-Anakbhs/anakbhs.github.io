"""Deterministic derivatives. Default: metadata/plan only, no output files.

Run --encode ONLY after the parent confirms baseline capture. No site wiring.
Examples: --encode --group static; --encode --group p1 --threads 2
P1 defaults reproduce the selected recipes: thumb color/alpha CRF 43/32,
speed 6; full CRF 34/48, speed 4, invisible RGB filling. WebP quality 75,
four alpha levels for the resized thumbnail (the binary full alpha is unchanged).
Use --only pub-high-order-tog to select a single source by its filename stem.
Existing outputs are never overwritten. Tune in NEW --output/--review directories.

Optional --measurements JSON, keyed by source relative to public/media:
{"pub-high-order-tog.png": [{"role": "full", "label": "chrome-1440",
 "css_width": 1328, "css_height": 407.587, "fit": "contain", "dpr": 2}]}
Use measured image/content boxes (exclude borders/padding); captions determine
lightbox height. Without measurements, comparisons use labelled CSS bounds,
not claimed browser measurements. Browser rasterization/playback QA is separate.
Stdout is JSON Lines; progress and FFmpeg diagnostics go to stderr.
"""

import argparse
from fractions import Fraction
import io
import json
import math
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys

from PIL import AvifImagePlugin, Image, ImageChops, ImageCms, ImageDraw, ImageOps, ImageStat, features


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "public" / "media"
P1 = "pub-lagrange-rotation.webp"
PUBLICATIONS = (
    "pub-high-order-tog.png", "pub-brick-but-agile-transparent.webp",
    "pub-gesturefuse-transparent.webp", "pub-marscanon-transparent.webp",
    "pub-rsc-gesturenet-transparent.webp", "pub-two-lower-bounds.png",
    "pub-shape-transformation-flow.png", "pub-shell-bdf2.png",
    "pub-leapfrog-reconstruction.png", "lc4dvit.png", "pub-mvt-transparent.webp",
)
PROJECTS = ("hero-bus.jpg", "project-wheel.png", "project-hand.png")
DETAILS = ("lego-bus-collage.png", "wheel-robot.png", "pub-brick-but-agile.png")
LOGOS = (
    "logos/fullbrick-transparent.png", "logos/tsinghua-air-transparent-hq.webp",
    "logos/must-highres.png", "logos/heroes-club-cutout.png",
)
BACKGROUNDS = ("#ffffff", "#f7f8fa", "#20242a")
LANCZOS = Image.Resampling.LANCZOS
FFMPEG = shutil.which("ffmpeg")
REPORT = None


def emit(**data):
    line = json.dumps(data, ensure_ascii=True)
    print(line, flush=True)
    if REPORT:
        REPORT.write(line + "\n")
        REPORT.flush()


def webp_timing(path):
    # RIFF metadata is enough to inspect timing without decoding 150 frames.
    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError(f"Not WebP: {path}")
    durations, loop, offset = [], None, 12
    while offset + 8 <= len(data):
        tag, size = struct.unpack_from("<4sI", data, offset)
        payload = offset + 8
        if payload + size > len(data):
            raise ValueError("Truncated WebP chunk")
        if tag == b"ANIM":
            loop = struct.unpack_from("<H", data, payload + 4)[0]
        elif tag == b"ANMF":
            durations.append(int.from_bytes(data[payload + 12:payload + 15], "little"))
        offset = payload + size + (size & 1)
    return durations, loop


def dimensions(size, width=None, box=None, geometry=()):
    scale = min(1, width / size[0]) if width else min(1, box[0] / size[0], box[1] / size[1])
    if scale == 1:
        return size
    nominal = max(1, round(size[0] * scale))
    upper = min(size[0], nominal + 16) if width else nominal
    choices = [(w, max(1, round(w * size[1] / size[0])))
               for w in range(max(1, nominal - 16), upper + 1)]
    if box:
        choices = [s for s in choices if s[0] <= box[0] and s[1] <= box[1]]
    def fitted(s, b):
        return (b[0], round(s[1] / s[0] * b[0])) if s[0] / s[1] > b[0] / b[1] else (round(s[0] / s[1] * b[1]), b[1])
    boxes = [tuple(round(c[k] * c.get("dpr", 2)) for k in ("css_width", "css_height"))
             for c in geometry if c.get("fit", "contain") == "contain"]
    def fit_error(s):
        return sum(sum(abs(a - b) for a, b in zip(fitted(s, b), fitted(size, b))) for b in boxes)
    # Near-identical aspect ratios avoid one-device-pixel object-fit rounding jumps.
    return min(choices, key=lambda s: (fit_error(s), Fraction(abs(s[0] * size[1] - s[1] * size[0]), s[0] * size[1]),
                                        abs(s[0] - nominal)))


def variants(name, size, geometry=()):
    thumb = [c for c in geometry if c["role"] == "thumb"]
    full = [c for c in geometry if c["role"] == "full"]
    if name == P1:
        return [(role, dimensions(size, width=w), ext)
                for role, w in (("thumb", 720), ("full", 1440))
                for ext in ("avif", "webp")]
    if name in LOGOS:
        if name == "logos/must-highres.png":
            return [("logo-2x", size, "webp"), ("logo-3x", size, "webp")]
        # DPR 2 desktop, plus a 3x candidate for mobile browser acceptance.
        box = (144, 96) if "tsinghua" in name or "must-" in name else (160, 112)
        return [(f"logo-{dpr}x", dimensions(size, box=(box[0] * dpr, box[1] * dpr), geometry=geometry), "webp")
                for dpr in (2, 3)]
    if name in DETAILS:
        return [("full", dimensions(size, box=(1712, 1712), geometry=full), "webp")]
    thumbs = (640, 880) if name in PUBLICATIONS else (640, 960)
    result = [(f"thumb-{w}", dimensions(size, width=w, geometry=thumb), "webp") for w in thumbs]
    if name == "pub-shell-bdf2.png":
        # Exact source ratio removes the measured mobile Chrome one-pixel shift.
        divisor = math.gcd(*size)
        unit = (size[0] // divisor, size[1] // divisor)
        multiple = max(1, min(divisor, round(880 / unit[0])))
        result[1] = ("thumb-880", (unit[0] * multiple, unit[1] * multiple), "webp")
    if name in PUBLICATIONS:
        result.append(("full", dimensions(size, box=(2560, 2560), geometry=full), "webp"))
    return result


def cases(name, role):
    def case(label, w, h, fit="contain"):
        return dict(label=label, role=role, css_width=w, css_height=h, fit=fit, dpr=2,
                    geometry_source="CSS bounds, not measured browser boxes")
    if role == "logo":
        career = "tsinghua" in name or "must-" in name
        return [case("desktop", *( (144, 96) if career else (160, 112))),
                case("mobile", *( (128, 80) if career else (144, 96)))]
    if role == "thumb" and (name in PUBLICATIONS or name == P1):
        return [case(label, w, w * 300 / 504) for label, w in
                (("desktop", 300), ("mobile-390", 350), ("responsive-maximum", 440))]
    if role == "thumb":
        contain = name != "hero-bus.jpg"
        inset = 40 if contain else 0
        return [case(label, w - inset, h - inset, "contain" if contain else "cover")
                for label, w, h in (("desktop", 1072 / 3, 1072 / 3 * 4 / 5),
                                    ("mobile-390", 350, 262.5), ("responsive-maximum", 480, 360))]
    if name in DETAILS:
        return [case("desktop-1440x900", 856, 585), case("mobile-390x844", 330, 548.6)]
    return [case("lightbox-upper-bound", 1328, 782), case("mobile-upper-bound", 346, 790)]


def render(im, case):
    box = tuple(max(1, round(case[key] * case.get("dpr", 2))) for key in ("css_width", "css_height"))
    if case.get("fit", "contain") == "cover":
        return ImageOps.fit(im, box, method=LANCZOS)
    scaled = ImageOps.contain(im, box, method=LANCZOS)
    canvas = Image.new("RGBA", box)
    canvas.paste(scaled, ((box[0] - scaled.width) // 2, (box[1] - scaled.height) // 2))
    return canvas


def pixel_metrics(a, b):
    diff = ImageChops.difference(a, b)
    histogram = diff.histogram()
    n = a.width * a.height * len(a.getbands())
    mae = sum((i % 256) * count for i, count in enumerate(histogram)) / n
    mse = sum((i % 256) ** 2 * count for i, count in enumerate(histogram)) / n
    maximum = max((i % 256 for i, count in enumerate(histogram) if count), default=0)
    changed = sum(count for i, count in enumerate(histogram) if i % 256)
    over8 = sum(count for i, count in enumerate(histogram) if i % 256 > 8)
    return dict(mae_8bit=round(mae, 6), rmse_8bit=round(math.sqrt(mse), 6), max_8bit=maximum,
                changed_channel_percent=round(changed * 100 / n, 5),
                over8_channel_percent=round(over8 * 100 / n, 5))


def composite(im, background):
    return Image.alpha_composite(Image.new("RGBA", im.size, background), im).convert("RGB")


def ssim(a, b):
    """FFmpeg's windowed RGB SSIM, not a global-statistics approximation."""
    width, height = a.size
    pair = Image.new("RGB", (width * 2, height))
    pair.paste(a, (0, 0))
    pair.paste(b, (width, 0))
    graph = (f"[0:v]split[a][b];[a]crop={width}:{height}:0:0,format=gbrp[r];"
             f"[b]crop={width}:{height}:{width}:0,format=gbrp[t];[r][t]ssim")
    result = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "info", "-nostdin",
        "-threads", "1", "-filter_complex_threads", "1", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{width * 2}x{height}", "-i", "pipe:0", "-filter_complex", graph,
        "-frames:v", "1", "-threads", "1", "-f", "null", "-"],
        input=pair.tobytes(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    match = re.search(rb"SSIM .*All:([0-9.]+)", result.stderr)
    if not match:
        raise RuntimeError(result.stderr.decode(errors="replace"))
    return float(match.group(1))


def srgb(im, profile):
    if not profile:
        return im
    rgb = ImageCms.profileToProfile(im.convert("RGB"),
                                   ImageCms.ImageCmsProfile(io.BytesIO(profile)),
                                   ImageCms.createProfile("sRGB"), outputMode="RGB")
    rgb.putalpha(im.getchannel("A"))
    return rgb


def compare(source, target, case, review, profile=None):
    expected = render(srgb(source, profile), case)
    actual = render(srgb(target, profile), case)
    content = ImageChops.lighter(expected.getchannel("A"), actual.getchannel("A")).getbbox()
    metrics = {}
    for bg in BACKGROUNDS:
        a, b = composite(expected, bg), composite(actual, bg)
        metrics[bg] = dict(**pixel_metrics(a, b), ssim_rgb=ssim(a, b),
                          ssim_rgb_content=ssim(a.crop(content), b.crop(content)) if content else 1.0)
    if review is not None and not review.exists():
        board = Image.new("RGB", (expected.width * 3, expected.height + 24), "white")
        a, b = composite(expected, BACKGROUNDS[1]), composite(actual, BACKGROUNDS[1])
        difference = ImageChops.difference(a, b).point(lambda v: min(255, v * 8))
        draw = ImageDraw.Draw(board)
        for index, (label, im) in enumerate((("original at display size", a), ("derivative", b), ("difference x8", difference))):
            board.paste(im, (index * expected.width, 24))
            draw.text((index * expected.width + 4, 4), label, fill="black")
        with review.open("xb") as out:
            board.save(out, format="PNG")
    return dict(**case, raster_size=expected.size, backgrounds=metrics,
                ssim_method="FFmpeg windowed planar RGB; content excludes outer letterboxing",
                alpha=pixel_metrics(expected.getchannel("A"), actual.getchannel("A")))


def output_path(directory, name, variant, ext):
    return directory / f"{Path(name).stem}.{variant}.{ext}"


def transparent_rgb_palette(frame):
    return [ImageStat.Stat(part.convert("RGB"), part.getchannel("A")).median
            for part in [frame.crop((i * frame.width // 4, 0, (i + 1) * frame.width // 4, frame.height))
                         for i in range(4)]]


def fill_transparent_rgb(frame, palette):
    result = frame.copy()
    for i, rgb in enumerate(palette):
        box = (i * frame.width // 4, 0, (i + 1) * frame.width // 4, frame.height)
        mask = frame.getchannel("A").crop(box).point(lambda a: 255 if a == 0 else 0)
        result.paste(tuple(rgb) + (0,), box, mask)
    return result


def encode_avif(source, target, size, args):
    # AVIF uses a color track and a separate single-plane auxiliary alpha track.
    command = [args.ffmpeg, "-hide_banner", "-loglevel", "warning", "-nostdin", "-n",
               "-filter_complex_threads", "1", "-f", "rawvideo", "-pix_fmt", "rgba",
               "-s", f"{size[0]}x{size[1]}", "-framerate", "25", "-i", "pipe:0",
               "-filter_complex", "[0:v]split[c][a];[c]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:range=limited[color];[a]alphaextract,setparams=colorspace=bt709:range=full[alpha]",
               "-map", "[color]", "-map", "[alpha]", "-c:v", "libaom-av1",
               "-b:v", "0", "-crf:v:0", str(args.p1_crf), "-crf:v:1", str(args.p1_alpha_crf),
               "-colorspace:v", "bt709", "-color_primaries:v:0", "bt709", "-color_trc:v:0", "iec61966-2-1",
               "-color_range:v:0", "tv", "-color_range:v:1", "pc", "-cpu-used", str(args.speed),
               "-threads", str(args.threads), "-row-mt", "1", "-g", "150",
               "-fps_mode", "passthrough", "-loop", "0", "-f", "avif", str(target)]
    emit(event="encoding", command=command)
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        with Image.open(source) as original:
            palette = transparent_rgb_palette(original.convert("RGBA")) if args.p1_fill_transparent_rgb else None
            for i in range(original.n_frames):
                original.seek(i)
                frame = original.convert("RGBA").resize(size, LANCZOS)
                if palette:
                    filled = fill_transparent_rgb(frame, palette)
                    if ImageChops.difference(composite(frame, "white"), composite(filled, "white")).getbbox():
                        raise ValueError("Hidden-RGB filling changed visible source pixels")
                    frame = filled
                process.stdin.write(frame.tobytes())
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("AVIF encoder failed; output is not validated")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def avif_native_metadata(path):
    data = path.read_bytes()
    durations, repeats = [], []
    def boxes(start, end):
        while start + 8 <= end:
            length, tag = struct.unpack_from(">I4s", data, start)
            header = 8
            if length == 1:
                length, header = struct.unpack_from(">Q", data, start + 8)[0], 16
            if length == 0:
                length = end - start
            if length < header or start + length > end:
                raise ValueError("Malformed AVIF box")
            p = start + header
            if tag in (b"moov", b"trak", b"edts"):
                boxes(p, start + length)
            elif tag == b"tkhd":
                durations.append(struct.unpack_from(">Q" if data[p] else ">I", data, p + (28 if data[p] else 20))[0])
            elif tag == b"elst":
                repeats.append(bool(int.from_bytes(data[p + 1:p + 4], "big") & 1))
            start += length
    boxes(0, len(data))
    if durations != [2**63 - 1] * 2 or repeats != [True, True]:
        raise ValueError(f"AVIF infinite-loop metadata not present: {durations}, {repeats}")
    command = [shutil.which("ffprobe"), "-v", "error", "-count_packets", "-show_packets",
               "-show_entries", "stream=index,codec_name,width,height,pix_fmt,nb_read_packets:packet=stream_index,pts_time,duration_time",
               "-of", "json", str(path)]
    probe = json.loads(subprocess.check_output(command))
    tracks = [s for s in probe["streams"] if int(s.get("nb_read_packets", 0)) == 150]
    if len(tracks) != 2:
        raise ValueError("Expected color and alpha AV1 tracks")
    for stream in tracks:
        packets = [p for p in probe["packets"] if p["stream_index"] == stream["index"]]
        if stream["codec_name"] != "av1" or len(packets) != 150:
            raise ValueError("Wrong codec/packet count")
        if any(abs(float(p["pts_time"]) - i * 0.04) > 1e-5 or
               abs(float(p["duration_time"]) - 0.04) > 1e-5 for i, p in enumerate(packets)):
            raise ValueError("Nonuniform AVIF frame timestamps")
    return dict(streams=tracks, track_durations=durations, repeated_edit_lists=repeats,
                loop="infinite: repeated edit lists and INT64_MAX track durations", packets_per_track=150)


def verify_animation(source, target, size, measured, review):
    samples, durations, alpha_mae, alpha_max = [], [], 0.0, 0
    transparent_border_max = 0
    alpha_values = set()
    with Image.open(source) as original, Image.open(target) as encoded:
        if encoded.n_frames != 150 or encoded.size != size or encoded.mode != "RGBA":
            raise ValueError(f"Animation dimensions/frame count/transparency failed: {target}")
        for i in range(150):
            original.seek(i)
            encoded.seek(i)
            expected, actual = original.convert("RGBA"), encoded.convert("RGBA")
            durations.append(encoded.info.get("duration"))
            expected_alpha = expected.resize(size, LANCZOS).getchannel("A")
            actual_alpha = actual.getchannel("A")
            alpha_values.update(i for i, count in enumerate(actual_alpha.histogram()) if count)
            alpha = pixel_metrics(expected_alpha, actual_alpha)
            alpha_mae += alpha["mae_8bit"]
            alpha_max = max(alpha_max, alpha["max_8bit"])
            for box in ((0, 0, size[0], 1), (0, size[1] - 1, size[0], size[1]),
                        (0, 0, 1, size[1]), (size[0] - 1, 0, size[0], size[1])):
                if expected_alpha.crop(box).getextrema()[1] == 0:
                    transparent_border_max = max(transparent_border_max, actual_alpha.crop(box).getextrema()[1])
            if i in (0, 37, 74, 112, 149):
                samples.append(dict(frame=i, comparisons=[compare(expected, actual, case,
                    review / f"{target.name}.frame-{i}.{j}.png" if j == 0 else None)
                    for j, case in enumerate(measured)]))
    if durations != [40] * 150:
        raise ValueError(f"Frame durations changed: {sorted(set(durations))}")
    if target.suffix == ".webp" and webp_timing(target) != ([40] * 150, 0):
        raise ValueError("WebP frame count/timing/loop changed")
    native = avif_native_metadata(target) if target.suffix == ".avif" else dict(loop=0)
    return dict(frames=150, frame_ms=40, duration_ms=6000, alpha_mae=alpha_mae / 150,
                alpha_max=alpha_max, transparent_border_max=transparent_border_max,
                alpha_values=sorted(alpha_values),
                native=native, samples=samples)


def main():
    global FFMPEG, REPORT
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--encode", action="store_true", help="Write derivatives; only after baseline capture")
    parser.add_argument("--verify-existing", action="store_true", help="Only compare existing derivatives")
    parser.add_argument("--group", choices=("all", "static", "p1"), default="all")
    parser.add_argument("--only", help="One source filename stem, without extension")
    parser.add_argument("--variant", help="Select one variant, e.g. thumb or full")
    parser.add_argument("--format", choices=("webp", "avif"), help="Select one output format")
    parser.add_argument("--output", type=Path, default=MEDIA / "derived")
    parser.add_argument("--review", type=Path, default=ROOT / "output" / "media-derivative-review")
    parser.add_argument("--measurements", type=Path, help="Measured browser image/content boxes as described above")
    parser.add_argument("--report", type=Path, help="New JSONL quality report (never overwritten)")
    parser.add_argument("--browser-renders", type=Path, help="Compare screenshots from render-derivative-comparisons.mjs")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--p1-crf", type=int, choices=range(64), metavar="0..63")
    parser.add_argument("--p1-alpha-crf", type=int, choices=range(64), metavar="0..63")
    parser.add_argument("--p1-fill-transparent-rgb", action=argparse.BooleanOptionalAction, default=None, help="Compress RGB under alpha=0 without changing visible source pixels")
    parser.add_argument("--p1-webp-quality", type=int, choices=range(101), default=75, metavar="0..100")
    parser.add_argument("--p1-webp-alpha-levels", type=int, choices=range(2, 257), default=4, metavar="2..256")
    parser.add_argument("--speed", type=int, choices=range(9))
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    if not 1 <= args.threads <= 4:
        parser.error("--threads must be between 1 and 4")
    AvifImagePlugin.DEFAULT_MAX_THREADS = args.threads
    FFMPEG = args.ffmpeg
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        REPORT = args.report.open("x", encoding="utf-8")
    if args.browser_renders:
        index = json.loads(args.browser_renders.read_text(encoding="utf-8"))
        emit(event="browser-plan", engine=index["engine"], comparisons=len(index["comparisons"]))
        for entry in index["comparisons"]:
            with Image.open(entry["reference"]) as image:
                reference = image.convert("RGB")
            with Image.open(entry["actual"]) as image:
                actual = image.convert("RGB")
            if reference.size != actual.size:
                raise ValueError("Mismatched browser screenshot geometry")
            crop = entry["crop"]
            crop = (max(0, crop[0]), max(0, crop[1]), min(reference.width, crop[2]), min(reference.height, crop[3]))
            emit(event="browser-result", **entry, pixels=pixel_metrics(reference, actual),
                 ssim_rgb=ssim(reference, actual),
                 ssim_rgb_content=ssim(reference.crop(crop), actual.crop(crop)))
        return
    sources = list(PUBLICATIONS + PROJECTS + DETAILS + LOGOS) if args.group != "p1" else []
    if args.group != "static":
        sources.append(P1)
    if args.only:
        sources = [name for name in sources if Path(name).stem == args.only]
        if not sources:
            parser.error("--only must match a source in the selected group")
    measurements = json.loads(args.measurements.read_text(encoding="utf-8-sig")) if args.measurements else {}
    plan = []
    for name in sources:
        path = MEDIA / name
        with Image.open(path) as original:
            item = dict(source=name, size=original.size, bytes=path.stat().st_size,
                        frames=getattr(original, "n_frames", 1), icc=bool(original.info.get("icc_profile")))
            item["variants"] = [dict(variant=v, size=s, target=str(output_path(args.output, name, v, ext)))
                                for v, s, ext in variants(name, original.size, measurements.get(name, []))
                                if (not args.variant or args.variant == v) and (not args.format or args.format == ext)]
        if name == P1:
            durations, loop = webp_timing(path)
            if durations != [40] * 150 or loop != 0 or item["size"] != (1440, 550):
                raise ValueError("P1 source differs from inspected 1440x550 / 150x40ms / loop=0")
            item.update(frame_ms=40, loop=loop)
        plan.append(item)
    emit(event="plan", encode=args.encode, pillow=Image.__version__, webp=features.check("webp"),
         avif=features.check("avif"), sources=plan,
         note="No browser equivalence claims; measured geometry and browser playback QA remain separate.")
    if not args.encode and not args.verify_existing:
        return
    if not args.ffmpeg:
        parser.error("Installed FFmpeg is required for SSIM and P1")
    for item in plan:
        for variant in item["variants"]:
            target = Path(variant["target"])
            if (target.exists() and not args.verify_existing) or target.resolve() in {(MEDIA / name).resolve() for name in sources}:
                raise FileExistsError(f"Refusing to overwrite: {target}")
    args.output.mkdir(parents=True, exist_ok=True)
    args.review.mkdir(parents=True, exist_ok=True)
    for item in plan:
        name, source = item["source"], MEDIA / item["source"]
        for variant in item["variants"]:
            target, size = Path(variant["target"]), tuple(variant["size"])
            role = variant["variant"].split("-")[0]
            measured = [dict(c, geometry_source="measured browser box") for c in measurements.get(name, []) if c["role"] == role]
            measured = measured or cases(name, role)
            print(f"Encoding {target.name}", file=sys.stderr, flush=True)
            if name != P1:
                with Image.open(source) as original:
                    expected, profile = original.convert("RGBA"), original.info.get("icc_profile")
                    resized = expected.resize(size, LANCZOS)
                    options = dict(format="WEBP", lossless=True, exact=True, method=6, quality=100)
                    if profile:
                        options["icc_profile"] = profile
                    if not args.verify_existing:
                        with target.open("xb") as out:
                            resized.save(out, **options)
                with Image.open(target) as encoded:
                    actual = encoded.convert("RGBA")
                    if encoded.info.get("icc_profile") != profile:
                        raise ValueError("Color profile was not retained")
                exact = pixel_metrics(resized, actual)
                if exact["max_8bit"]:
                    raise ValueError(f"Lossless encoding changed resized pixels: {target}")
                checks = [compare(expected, actual, case, args.review / f"{target.name}.{j}.png", profile)
                          for j, case in enumerate(measured)]
                emit(event="static-result", source=name, source_size=item["size"], target=str(target), size=size,
                     bytes=target.stat().st_size, source_bytes=item["bytes"], encode_pixel_difference=exact,
                     display_comparisons=checks)
            else:
                recipe = argparse.Namespace(**vars(args))
                recipe.p1_crf = args.p1_crf if args.p1_crf is not None else (43 if role == "thumb" else 34)
                recipe.p1_alpha_crf = args.p1_alpha_crf if args.p1_alpha_crf is not None else (32 if role == "thumb" else 48)
                recipe.speed = args.speed if args.speed is not None else (6 if role == "thumb" else 4)
                recipe.p1_fill_transparent_rgb = args.p1_fill_transparent_rgb if args.p1_fill_transparent_rgb is not None else role == "full"
                if args.verify_existing:
                    pass
                elif target.suffix == ".avif":
                    encode_avif(source, target, size, recipe)
                else:
                    with Image.open(source) as original:
                        frames = []
                        for i in range(150):
                            original.seek(i)
                            frame = original.convert("RGBA").resize(size, LANCZOS)
                            levels = args.p1_webp_alpha_levels
                            if levels < 256:
                                lut = [round(round(a * (levels - 1) / 255) * 255 / (levels - 1)) for a in range(256)]
                                frame.putalpha(frame.getchannel("A").point(lut))
                            frames.append(frame)
                    with target.open("xb") as out:
                        frames[0].save(out, format="WEBP", save_all=True, append_images=frames[1:],
                                       duration=[40] * 150, loop=0, lossless=False,
                                       quality=args.p1_webp_quality, alpha_quality=100, method=4,
                                       allow_mixed=False, minimize_size=False)
                    del frames
                verification = verify_animation(source, target, size, measured, args.review)
                limit = 1_000_000 if role == "thumb" else 2_000_000
                emit(event="p1-result", source=name, source_size=item["size"], target=str(target), size=size,
                     color_crf=recipe.p1_crf, alpha_crf=recipe.p1_alpha_crf, speed=recipe.speed,
                     transparent_rgb_fill=recipe.p1_fill_transparent_rgb if target.suffix == ".avif" else False,
                     webp_quality=args.p1_webp_quality,
                     webp_alpha_levels=args.p1_webp_alpha_levels,
                     bytes=target.stat().st_size, target_bytes=limit,
                     within_target=target.stat().st_size <= limit, verification=verification)


if __name__ == "__main__":
    main()
