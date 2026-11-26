import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { site } from "../../content/site";
import type { LiquidLens } from "liquid-gl";
import { useGlassProfile } from '../../content/glassStore';
import { rgba, type GlassProfile } from '../../content/glassSchema';
import { getView } from '../../lib/siteView';
import { useReducedMotion } from '../../lib/reducedMotion';

type Bounds = { left: number; width: number };

// The selection lens slides to the active link on a spring (stiffness 300, damping 24, mass 0.9) and keeps its
// speed when a new destination interrupts it. It rests within 0.5 px and 2 px/s, then snaps into place.
function createSpring(apply: (bounds: Bounds) => void) {
  const now: Bounds = { left: 4, width: 0 };
  const speed: Bounds = { left: 0, width: 0 };
  let target: Bounds = { ...now };
  let frame = 0;
  let last = 0;
  const step = (time: number) => {
    let remaining = Math.min(time - last, 64) / 1000; // a stalled tab does not throw the lens across the bar
    last = time;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 240);
      remaining -= dt;
      for (const key of ["left", "width"] as const) {
        speed[key] += ((-300 * (now[key] - target[key]) - 24 * speed[key]) / 0.9) * dt;
        now[key] += speed[key] * dt;
      }
    }
    const resting = (["left", "width"] as const).every((key) => Math.abs(now[key] - target[key]) < 0.5 && Math.abs(speed[key]) < 2);
    if (resting) { Object.assign(now, target); Object.assign(speed, { left: 0, width: 0 }); }
    apply(now);
    frame = resting ? 0 : requestAnimationFrame(step);
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; };
  return {
    stop,
    jump(bounds: Bounds) { stop(); Object.assign(now, bounds); target = { ...bounds }; Object.assign(speed, { left: 0, width: 0 }); apply(now); },
    to(bounds: Bounds) { target = { ...bounds }; if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); } },
    get: () => ({ ...now }),
  };
}

function lensSettings(p: GlassProfile) {
  return { refraction: Number(p.refraction), frost: Number(p.frost), aberration: Number(p.aberration),
    bevelDepth: Number(p.bevelDepth), bevelWidth: Number(p.bevelWidth), magnify: Number(p.magnify),
    interactionStrength: Number(p.interactionStrength), interactionRadius: Number(p.interactionRadius),
    interactionViscosity: Number(p.interactionViscosity), shadow: Boolean(p.shadow), specular: Boolean(p.specular) };
}

export function LiquidNavigation({ tone, activeSection, onSelect, open }: {
  tone: "light" | "dark";
  activeSection: string;
  onSelect: (id: string) => void;
  open: boolean;
}) {
  const nav = useRef<HTMLElement>(null);
  const lens = useRef<LiquidLens | null>(null);
  const openState = useRef(open);
  openState.current = open;
  const wakeRenderer = useRef<() => void>(() => {});
  const id = `navigation-lens-${useId().replace(/:/g, "")}`;
  const destination = useRef<Bounds | null>(null);
  const lensElement = useRef<HTMLSpanElement>(null);
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const profile = useGlassProfile('selection');
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [simpleMaterial, setSimpleMaterial] = useState(false);
  const spring = useRef<ReturnType<typeof createSpring> | null>(null);
  spring.current ??= createSpring(({ left, width }) => {
    const element = lensElement.current;
    if (element) { element.style.left = `${left}px`; element.style.width = `${width}px`; }
    lens.current?.renderer?.invalidate();
  });

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
    const update = () => setSimpleMaterial(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const positionLens = useCallback(() => {
    const active = nav.current?.querySelector<HTMLElement>('a[aria-current]');
    if (!active) {
      spring.current?.jump({ left: spring.current.get().left, width: 0 });
      destination.current = null;
      return;
    }
    const next = { left: active.offsetLeft, width: active.offsetWidth };
    // Resize notifications must not cancel a spring already heading to these bounds.
    if (destination.current?.left === next.left && destination.current.width === next.width) return;
    const immediate = !destination.current || reduceMotion;
    destination.current = next;
    if (immediate) spring.current?.jump(next);
    else spring.current?.to(next);
  }, [reduceMotion]);

  useLayoutEffect(() => {
    positionLens();
  }, [activeSection, pathname, positionLens]);

  useEffect(() => {
    if (!nav.current) return;
    const observer = new ResizeObserver(() => positionLens());
    observer.observe(nav.current);
    return () => { observer.disconnect(); spring.current?.stop(); };
  }, [positionLens]);

  useEffect(() => {
    let disposed = false;
    if (simpleMaterial) return;
    let video: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null = null;
    let videoFrame = 0;
    let animationFrame = 0;
    let captureTimer = 0;
    const stopVideo = () => {
      if (videoFrame && video instanceof HTMLVideoElement) video.cancelVideoFrameCallback(videoFrame);
      cancelAnimationFrame(animationFrame);
      videoFrame = animationFrame = 0;
    };
    const drawVideo = () => {
      videoFrame = animationFrame = 0;
      if (disposed || !openState.current || document.hidden || !video) return;
      if (video instanceof HTMLVideoElement && video.paused) return;
      if (getView() !== 'cover') return;
      lens.current?.renderer?.invalidate();
      if (video instanceof HTMLVideoElement && 'requestVideoFrameCallback' in video) videoFrame = video.requestVideoFrameCallback(drawVideo);
      else if (!(video instanceof HTMLCanvasElement)) animationFrame = requestAnimationFrame(drawVideo);
    };
    const watchVideo = () => {
      stopVideo();
      // The cover's picture is drawn over the page's own snapshot, which lies at the same place in
      // the document; once the cover has gone, the snapshot takes its place again.
      video = getView() === 'cover' ? document.querySelector<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement>('.hero-video, .hero-fallback[data-media-ready="true"]') : null;
      const renderer = lens.current?.renderer;
      if (renderer && (renderer._videoNodes.length !== (video ? 1 : 0) || renderer._videoNodes[0] !== video)) {
        const left = renderer._videoNodes.length > 0 && !video;
        renderer._videoNodes = video ? [video] : [];
        if (left) renderer.restoreSnapshotBand();
      }
      if (renderer && video && openState.current && !document.hidden) drawVideo();
    };
    const wake = () => {
      watchVideo();
      lens.current?.renderer?.invalidate(reduceMotion ? 0 : 360);
    };
    wakeRenderer.current = wake;
    const onPointer = () => lens.current?.renderer?.invalidate(reduceMotion ? 0 : 450);
    // A snapshot rasterises the whole page (hundreds of ms on slow CPUs), so lazy images
    // arriving mid-scroll wait until scrolling settles; dialog images never change the page.
    let lastScroll = 0;
    let needsCapture = false;
    const recapture = () => {
      if (!needsCapture || disposed || document.querySelector('dialog[open]')) return;
      const quiet = performance.now() - lastScroll;
      if (quiet < 400) { captureTimer = window.setTimeout(recapture, 400 - quiet); return; }
      needsCapture = false;
      void lens.current?.renderer?.captureSnapshot();
    };
    const onImageLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement) || event.target.closest('dialog')) return;
      needsCapture = true;
      clearTimeout(captureTimer);
      captureTimer = window.setTimeout(recapture, 300);
    };
    const onDialogClose = () => {
      if (!needsCapture) return;
      clearTimeout(captureTimer);
      captureTimer = window.setTimeout(recapture, 400);
    };
    const videoEvents = ['playing', 'pause', 'seeked', 'loadeddata', 'visibilitychange', 'hero-media-change', 'rg-view-change'];
    videoEvents.forEach(name => document.addEventListener(name, wake, true));
    const onMediaFrame = () => { if (openState.current) lens.current?.renderer?.invalidate(); };
    const onMediaScroll = () => {
      lastScroll = performance.now();
      if (video && !(video instanceof HTMLVideoElement)) watchVideo();
    };
    document.addEventListener('hero-media-frame', onMediaFrame);
    window.addEventListener('scroll', onMediaScroll, { passive: true });
    document.addEventListener('load', onImageLoad, true);
    document.addEventListener('close', onDialogClose, true);
    const header = nav.current?.closest('.site-header');
    header?.addEventListener('pointermove', onPointer, { passive: true });
    header?.addEventListener('pointerleave', onPointer, { passive: true });
    const initialize = async () => {
      const { default: liquidGL } = await import("liquid-gl");
      await document.fonts.ready;
      if (disposed || !nav.current) return;
      // Keep the original navigation shader and its fluid interaction intact.
      const instance = liquidGL({
        target: `#${id}`, snapshot: "body", content: false, resolution: 0.85, frameloop: "demand",
        ...lensSettings(profileRef.current),
        specular: !reduceMotion && Boolean(profileRef.current.specular), reveal: "none", tilt: false,
        interaction: reduceMotion ? "none" : "fluid",
        tint: rgba(String(profileRef.current.tintColor), Number(profileRef.current.tintOpacity)), zIndex: 40,
      });
      lens.current = Array.isArray(instance) ? instance[0] : instance ?? null;
      lens.current?.setTint(rgba(String(profileRef.current.tintColor), Number(profileRef.current.tintOpacity)));
      lens.current?.renderer?.setSuspended(!openState.current);
      // A phone can take the WebGL context away (a tab in the background); its programs and textures
      // go with it, so the lens stands down until there is a context again, then starts over.
      lensCanvas?.removeEventListener('webglcontextlost', onContextLost);
      lensCanvas?.removeEventListener('webglcontextrestored', onContextRestored);
      lensCanvas = lens.current?.renderer?.canvas ?? null;
      lensCanvas?.addEventListener('webglcontextlost', onContextLost);
      lensCanvas?.addEventListener('webglcontextrestored', onContextRestored);
      wake();
    };
    let lensCanvas: HTMLCanvasElement | null = null;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      lens.current?.renderer?.setSuspended(true);
    };
    const onContextRestored = () => {
      if (disposed) return;
      lens.current?.destroy();
      lens.current = null;
      void initialize();
    };
    void initialize();
    return () => {
      disposed = true;
      lensCanvas?.removeEventListener('webglcontextlost', onContextLost);
      lensCanvas?.removeEventListener('webglcontextrestored', onContextRestored);
      stopVideo();
      clearTimeout(captureTimer);
      videoEvents.forEach(name => document.removeEventListener(name, wake, true));
      document.removeEventListener('hero-media-frame', onMediaFrame);
      window.removeEventListener('scroll', onMediaScroll);
      document.removeEventListener('load', onImageLoad, true);
      document.removeEventListener('close', onDialogClose, true);
      header?.removeEventListener('pointermove', onPointer);
      header?.removeEventListener('pointerleave', onPointer);
      wakeRenderer.current = () => {};
      lens.current?.destroy();
      lens.current = null;
    };
  }, [id, reduceMotion, simpleMaterial]);

  useEffect(() => {
    lens.current?.renderer?.setSuspended(false);
    wakeRenderer.current();
    const timer = open ? 0 : window.setTimeout(() => lens.current?.renderer?.setSuspended(true), reduceMotion ? 0 : 280);
    return () => clearTimeout(timer);
  }, [open, reduceMotion]);

  useEffect(() => {
    if (nav.current && lens.current) {
      lens.current.setTint(rgba(String(profile.tintColor), Number(profile.tintOpacity)));
      const shadowChanged = lens.current.options.shadow !== Boolean(profile.shadow);
      Object.assign(lens.current.options, lensSettings(profile), { specular: !reduceMotion && Boolean(profile.specular) });
      if (shadowChanged) lens.current.setShadow(Boolean(profile.shadow));
    }
    wakeRenderer.current();
  }, [tone, profile, reduceMotion]);

  useEffect(() => {
    wakeRenderer.current();
    const refresh = window.setTimeout(() => { void lens.current?.renderer?.captureSnapshot(); }, 220);
    return () => window.clearTimeout(refresh);
  }, [pathname]);

  return (
    <nav ref={nav} className="nav-links" aria-label="Sections">
      {site.nav.map((item) => (
        <Link key={item.id} to={item.href} className={activeSection === item.id ? "active" : undefined}
          aria-current={activeSection === item.id ? "location" : undefined}
          onClick={(event) => {
            if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              onSelect(item.id);
            }
          }}>
          <span className="nav-label" data-liquid-ignore="">{item.label}</span>
        </Link>
      ))}
      <span ref={lensElement} id={id} className="nav-lens" style={{ left: 4, width: 0 }} aria-hidden="true" data-liquid-ignore="" data-glass-type="selection" />
    </nav>
  );
}
