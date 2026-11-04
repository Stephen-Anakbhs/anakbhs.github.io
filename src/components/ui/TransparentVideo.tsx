import { useEffect, useRef, useState } from "react";
import { getView, onViewChange } from "../../lib/siteView";
import "../../styles/transparent-video.css";

// A film with a real alpha channel that plays the same everywhere. No video format carries alpha in
// every browser, so the file is plain H.264 with the color (premultiplied) in its top half and the alpha
// in its bottom half, joined again here on a canvas. It plays only while it can be seen. Where the browser
// will not start a video without a tap (iOS Low Power Mode), the frames are decoded by hand; failing
// that, and under reduced motion, the poster stays.

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_frame;
varying vec2 v_uv;
void main() {
  vec3 color = texture2D(u_frame, vec2(v_uv.x, v_uv.y * 0.5)).rgb;
  // Lift the compression noise out of the clear areas.
  float alpha = clamp((texture2D(u_frame, vec2(v_uv.x, 0.5 + v_uv.y * 0.5)).r - 0.015) / 0.97, 0.0, 1.0);
  gl_FragColor = vec4(min(color, vec3(alpha)), alpha);
}`;

type Source = TexImageSource;

function createPainter(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" }) as WebGLRenderingContext | null;
  if (!gl || gl.isContextLost()) return null;
  const compile = (type: number, text: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, text);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.clearColor(0, 0, 0, 0);
  return {
    draw(source: Source, width: number, height: number) {
      const rows = Math.round(height / 2);
      if (canvas.width !== width || canvas.height !== rows) {
        canvas.width = width;
        canvas.height = rows;
        gl.viewport(0, 0, width, rows);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    release() { gl.getExtension("WEBGL_lose_context")?.loseContext(); },
  };
}

export function TransparentVideo({ src, poster, alt, className = "", active = true, posterWhileLoading = true }: {
  src: string;
  poster: string;
  alt: string;
  className?: string;
  /** False while something else (an open detail sheet) has taken over. */
  active?: boolean;
  posterWhileLoading?: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const activeNow = useRef(active);
  activeNow.current = active;
  const syncRef = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const element = video.current;
    const box = host.current;
    if (!element || !box) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setStuck(true); return; }
    // A canvas keeps its WebGL context for life and the page may only hold a few at once, so each run
    // gets its own canvas and gives the context back when it ends.
    const surface = document.createElement("canvas");
    surface.className = "transparent-video-canvas";
    surface.setAttribute("aria-hidden", "true");
    surface.dataset.liquidIgnore = "";
    box.insertBefore(surface, element);
    const painter = createPainter(surface);
    if (!painter) { surface.remove(); setStuck(true); return; }

    // The muted state has to be on the element before its first load, or a phone refuses to play it.
    element.muted = true;
    element.defaultMuted = true;
    element.setAttribute("muted", "");

    let disposed = false;
    let inView = false;
    let loaded = false;
    let frame = 0;
    let frameCallback = 0;
    let freshFrame = false;
    let lastCallback = 0;
    let lastTime = -1;
    let decoding: AbortController | null = null;
    let resumeAt = 0;
    let refused = false;
    let announced = false;
    let lastSeen = -1;
    let lastProgress = 0;
    const announce = () => {
      if (announced || disposed) return;
      announced = true;
      setPlaying(true);
      setStuck(false);
    };
    const giveUp = () => {
      if (disposed) return;
      announced = false;
      setPlaying(false);
      setStuck(true);
    };
    const shouldPlay = () => inView && activeNow.current && !document.hidden && getView() === "content";

    // Native playback was refused: decode the frames ourselves, or keep the poster.
    const fallBack = () => {
      if (decoding || disposed) return;
      if (typeof VideoDecoder === "undefined") { giveUp(); return; }
      element.pause();
      element.removeAttribute("src");
      element.load();
      loaded = false;
      decoding = new AbortController();
      const signal = decoding.signal;
      void import("../home/canvasHeroPlayback").then(({ playDecodedFrames }) => playDecodedFrames(src, signal, resumeAt, (decoded, end) => {
        resumeAt = end;
        painter.draw(decoded, decoded.displayWidth, decoded.displayHeight);
        announce();
      })).catch(() => {
        if (!signal.aborted) giveUp();
      });
    };

    const paint = () => {
      if (element.readyState < 2 || !element.videoWidth) return;
      try {
        painter.draw(element, element.videoWidth, element.videoHeight);
        announce();
      } catch {
        fallBack();
      }
    };
    const callbackFrame = () => {
      frameCallback = 0;
      if (disposed || !shouldPlay()) return;
      freshFrame = true;
      lastCallback = performance.now();
      frameCallback = element.requestVideoFrameCallback(callbackFrame);
    };
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const time = element.currentTime;
      // Some in-app browsers neither play nor refuse: go by progress, not by the promise. A slow
      // download is not a refusal.
      const now = performance.now();
      const buffering = element.networkState === element.NETWORK_LOADING && element.readyState < element.HAVE_FUTURE_DATA;
      if (time !== lastSeen || buffering) {
        lastSeen = time;
        lastProgress = now;
      } else if (now - lastProgress > 4000) {
        refused = true;
        stopLoop();
        fallBack();
        return;
      }
      // A browser that stops reporting frames for a video it thinks nobody sees still advances the clock.
      const quiet = now - lastCallback > 400;
      if (freshFrame || (quiet && time !== lastTime)) {
        freshFrame = false;
        lastTime = time;
        paint();
      }
    };
    const stopLoop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (frameCallback) element.cancelVideoFrameCallback(frameCallback);
      frameCallback = 0;
    };
    const startLoop = () => {
      if (!frame) {
        lastProgress = performance.now();
        frame = requestAnimationFrame(tick);
      }
      if (!frameCallback && typeof element.requestVideoFrameCallback === "function") frameCallback = element.requestVideoFrameCallback(callbackFrame);
    };

    const sync = () => {
      if (disposed) return;
      if (!shouldPlay()) {
        stopLoop();
        element.pause();
        decoding?.abort();
        decoding = null;
        return;
      }
      if (refused) { fallBack(); return; }
      if (!loaded) {
        loaded = true;
        element.src = src;
        element.load();
      }
      startLoop();
      void element.play().catch((error: DOMException) => {
        if (disposed || error.name === "AbortError") return;
        if (error.name === "NotAllowedError") {
          refused = true;
          stopLoop();
          if (shouldPlay()) fallBack();
        } else giveUp();
      });
    };
    syncRef.current = sync;

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }, { rootMargin: "120px 0px" });
    observer.observe(box);
    const stopView = onViewChange(sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    element.addEventListener("loadeddata", paint);
    return () => {
      disposed = true;
      syncRef.current = () => {};
      observer.disconnect();
      stopView();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
      element.removeEventListener("loadeddata", paint);
      stopLoop();
      decoding?.abort();
      element.pause();
      element.removeAttribute("src");
      element.load();
      painter.release();
      surface.remove();
    };
  }, [src]);

  useEffect(() => { syncRef.current(); }, [active]);

  const showPoster = !playing && (posterWhileLoading || stuck);
  return (
    <span ref={host} className={`transparent-video ${className}`} data-playing={playing}>
      <img className="transparent-video-poster" src={poster} alt={alt} draggable={false} loading="lazy" decoding="async"
        data-shown={showPoster} />
      <video ref={video} className="transparent-video-source" muted playsInline loop preload="none" disablePictureInPicture
        disableRemotePlayback tabIndex={-1} aria-hidden="true" data-liquid-ignore="" />
    </span>
  );
}
