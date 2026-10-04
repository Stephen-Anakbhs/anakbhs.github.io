import { useEffect, useRef, useState } from 'react';

const notify = () => document.dispatchEvent(new Event('hero-media-change'));

/** Reuse the original file without palette conversion or frame removal. */
export default function AnimatedHeroFallback({ src }: { src: string }) {
  const host = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const resumeTime = useRef(0);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<'image' | 'canvas' | 'poster'>(() =>
    typeof VideoDecoder === 'undefined' ? 'image' : 'canvas');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hero = host.current?.closest('.hero');
    if (!hero) return;
    const refresh = () => {
      const r = hero.getBoundingClientRect();
      setActive(!document.hidden && r.bottom > 0 && r.top < innerHeight);
    };
    const observer = new IntersectionObserver(refresh);
    observer.observe(hero);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    notify();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', refresh); notify(); };
  }, []);

  useEffect(() => {
    notify();
    if (mode !== 'image' || !active) return;
    let previous: Uint8ClampedArray | undefined;
    const sample = document.createElement('canvas');
    sample.width = 16; sample.height = 9;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    const started = performance.now();
    // An image load event is not proof of animation either. Sample only during startup.
    const timer = window.setInterval(() => {
      const img = image.current;
      if (!img || !ctx) return;
      if (img.complete && img.naturalWidth) {
        try {
          ctx.drawImage(img, 0, 0, 16, 9);
          const pixels = ctx.getImageData(0, 0, 16, 9).data;
          if (previous && pixels.some((v, i) => Math.abs(v - previous![i]) > 3)) {
            clearInterval(timer);
            setReady(true);
            return;
          }
          previous = pixels;
        } catch { clearInterval(timer); setReady(false); setMode('canvas'); return; }
      }
      if (performance.now() - started >= 6000) {
        clearInterval(timer); setReady(false); setMode('canvas');
      }
    }, 250);
    return () => clearInterval(timer);
  }, [active, mode]);

  useEffect(() => {
    if (mode !== 'canvas' || !active || !canvas.current) return;
    const controller = new AbortController();
    const target = canvas.current;
    void import('./canvasHeroPlayback').then(({ playCanvasHero }) => {
      if (controller.signal.aborted) return;
      return playCanvasHero(target, src, controller.signal, resumeTime.current, (time) => {
        resumeTime.current = time;
        if (target.dataset.mediaReady !== 'true') {
          target.dataset.mediaReady = 'true';
          setReady(true);
          notify();
        }
        document.dispatchEvent(new Event('hero-media-frame'));
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.warn('Animated background unavailable', error);
      setReady(false); setMode('poster');
    });
    return () => controller.abort();
  }, [active, mode, src]);

  useEffect(() => { if (!active) setReady(false); notify(); }, [ready, active, mode]);

  return <div ref={host} className="hero-fallback-layer" data-mode={mode} aria-hidden="true">
    {active && mode === 'image' && <img ref={image} className="hero-fallback" src={src} alt=""
      data-media-ready={ready} onLoad={() => { setReady(true); notify(); }}
      onError={() => { setReady(false); setMode('canvas'); }} />}
    {active && mode === 'canvas' && <canvas ref={canvas} className="hero-fallback" width={1920} height={1080}
      data-media-ready={ready} />}
  </div>;
}
