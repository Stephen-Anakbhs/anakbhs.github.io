import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { site } from "../../content/site";
import type { LiquidLens } from "liquid-gl";
import { useGlassProfile } from '../../content/glassStore';
import { rgba, type GlassProfile } from '../../content/glassSchema';

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
  const destination = useRef<{ left: number; width: number } | null>(null);
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  const profile = useGlassProfile('selection');
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [simpleMaterial, setSimpleMaterial] = useState(false);
  const left = useMotionValue(4);
  const width = useMotionValue(0);

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
      left.stop();
      width.stop();
      width.set(0);
      destination.current = null;
      return;
    }
    const next = { left: active.offsetLeft, width: active.offsetWidth };
    // Resize notifications must not cancel a spring already heading to these bounds.
    if (destination.current?.left === next.left && destination.current.width === next.width) return;
    const immediate = !destination.current || reduceMotion;
    destination.current = next;
    left.stop();
    width.stop();
    if (immediate) {
      left.set(next.left);
      width.set(next.width);
    } else {
      const spring = { type: "spring" as const, stiffness: 300, damping: 24, mass: 0.9 };
      animate(left, next.left, spring);
      animate(width, next.width, spring);
    }
  }, [left, width, reduceMotion]);

  useLayoutEffect(() => {
    positionLens();
  }, [activeSection, pathname, positionLens]);

  useEffect(() => {
    if (!nav.current) return;
    const observer = new ResizeObserver(() => positionLens());
    observer.observe(nav.current);
    return () => { observer.disconnect(); left.stop(); width.stop(); };
  }, [positionLens, left, width]);

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
      const rect = video.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight) return;
      lens.current?.renderer?.invalidate();
      if (video instanceof HTMLVideoElement && 'requestVideoFrameCallback' in video) videoFrame = video.requestVideoFrameCallback(drawVideo);
      else if (!(video instanceof HTMLCanvasElement)) animationFrame = requestAnimationFrame(drawVideo);
    };
    const watchVideo = () => {
      stopVideo();
      video = document.querySelector<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement>('.hero-video, .hero-fallback[data-media-ready="true"]');
      const renderer = lens.current?.renderer;
      if (renderer && (renderer._videoNodes.length !== (video ? 1 : 0) || renderer._videoNodes[0] !== video)) {
        renderer._videoNodes = video ? [video] : [];
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
    const recapture = () => {
      const quiet = performance.now() - lastScroll;
      if (quiet < 400) { captureTimer = window.setTimeout(recapture, 400 - quiet); return; }
      void lens.current?.renderer?.captureSnapshot();
    };
    const onImageLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement) || event.target.closest('dialog')) return;
      clearTimeout(captureTimer);
      captureTimer = window.setTimeout(recapture, 300);
    };
    const videoEvents = ['playing', 'pause', 'seeked', 'loadeddata', 'visibilitychange', 'hero-media-change'];
    videoEvents.forEach(name => document.addEventListener(name, wake, true));
    const onMediaFrame = () => { if (openState.current) lens.current?.renderer?.invalidate(); };
    const onMediaScroll = () => {
      lastScroll = performance.now();
      if (video && !(video instanceof HTMLVideoElement)) watchVideo();
    };
    document.addEventListener('hero-media-frame', onMediaFrame);
    window.addEventListener('scroll', onMediaScroll, { passive: true });
    document.addEventListener('load', onImageLoad, true);
    const header = nav.current?.closest('.site-header');
    header?.addEventListener('pointermove', onPointer, { passive: true });
    header?.addEventListener('pointerleave', onPointer, { passive: true });
    const stopLeft = left.on('change', () => lens.current?.renderer?.invalidate());
    const stopWidth = width.on('change', () => lens.current?.renderer?.invalidate());
    const initialize = async () => {
      const { default: liquidGL } = await import("liquid-gl");
      await document.fonts.ready;
      if (disposed || !nav.current) return;
      const material = getComputedStyle(nav.current);
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
      wake();
    };
    void initialize();
    return () => {
      disposed = true;
      stopVideo();
      clearTimeout(captureTimer);
      videoEvents.forEach(name => document.removeEventListener(name, wake, true));
      document.removeEventListener('hero-media-frame', onMediaFrame);
      window.removeEventListener('scroll', onMediaScroll);
      document.removeEventListener('load', onImageLoad, true);
      header?.removeEventListener('pointermove', onPointer);
      header?.removeEventListener('pointerleave', onPointer);
      stopLeft(); stopWidth();
      wakeRenderer.current = () => {};
      lens.current?.destroy();
      lens.current = null;
    };
  }, [id, reduceMotion, simpleMaterial, left, width]);

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
      <motion.span id={id} className="nav-lens" style={{ left, width }} aria-hidden="true" data-liquid-ignore="" data-glass-type="selection" />
    </nav>
  );
}
