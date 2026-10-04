"""Encode existing publication artwork losslessly for web delivery."""
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageSequence


media = Path(__file__).resolve().parents[1] / "public" / "media"
sources = [media / name for name in sys.argv[1:]] or list(media.glob("pub-*-transparent.png")) + [media / "pub-lagrange-rotation.gif"]

for source in sources:
    with Image.open(source) as original:
        frames = [frame.convert("RGBA") for frame in ImageSequence.Iterator(original)]
        durations = []
        for index in range(len(frames)):
            original.seek(index)
            durations.append(original.info.get("duration", 40))
        target = source.with_suffix(".webp")
        animated = len(frames) > 1
        # In lossless mode quality controls encoding effort, not the decoded pixels.
        frames[0].save(target, format="WEBP", lossless=True, exact=True, quality=20 if animated else 100,
                       method=3 if animated else 6, save_all=animated, append_images=frames[1:],
                       duration=durations, loop=original.info.get("loop", 0))
    with Image.open(target) as encoded:
        assert encoded.n_frames == len(frames)
        if len(frames) > 1:
            assert encoded.info["loop"] == 0
        for index, expected in enumerate(frames):
            encoded.seek(index)
            actual = encoded.convert("RGBA")
            assert actual.size == expected.size
            assert ImageChops.difference(actual.getchannel("A"), expected.getchannel("A")).getbbox() is None
            # RGB under fully transparent pixels is invisible; compare composited pixels.
            background = Image.new("RGBA", expected.size, (255, 255, 255, 255))
            difference = ImageChops.difference(Image.alpha_composite(background, actual),
                                              Image.alpha_composite(background, expected))
            assert difference.getbbox(alpha_only=False) is None, (source.name, index)
            if len(frames) > 1:
                assert encoded.info["duration"] == durations[index]
    print(f"{source.name}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes; "
          f"{len(frames)} pixel-equivalent frames", flush=True)
