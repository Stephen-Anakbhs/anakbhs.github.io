import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { site } from "../../content/site";
import { TypewriterLine } from "../hero/TypewriterLine";
import "../../styles/hero-video.css";

const HeroScene = lazy(() => import("../../scenes/hero/HeroScene").then((module) => ({ default: module.HeroScene })));
const AnimatedHeroFallback = lazy(() => import("./AnimatedHeroFallback"));

export function Hero() {
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(preference.matches);
    preference.addEventListener('change', update);
    update();
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const hero = heroRef.current;
    if (!video || !hero || reduceMotion || fallbackReason) return;
    let inView = false;
    let disposed = false;
    let pending = false;
    let playAttempt = 0;
    let retryFrame = 0;
    let bridgeTimer = 0;
    const wechat = /MicroMessenger/i.test(navigator.userAgent);
    let bridgeReady = !wechat || 'WeixinJSBridge' in window;
    let lastTime = video.currentTime;
    let lastProgress = performance.now();
    const shouldPlay = () => !disposed && inView && !document.hidden;
    const startPlayback = (retryOnce = true, fromBridge = false) => {
      if (!shouldPlay() || video.error || (!fromBridge && (pending || !video.paused))) return;
      video.muted = true;
      video.defaultMuted = true;
      pending = true;
      const attempt = ++playAttempt;
      // A play promise can be interrupted by leaving Home before decoding finishes.
      void video.play().then(() => {
        if (!shouldPlay()) video.pause();
      }).catch((error: DOMException) => {
        if (disposed || attempt !== playAttempt) return;
        if (error.name === 'NotAllowedError' && shouldPlay()) {
          // WeChat can initialize its host bridge after the page has mounted.
          if (!bridgeReady) {
            clearTimeout(bridgeTimer);
            bridgeTimer = window.setTimeout(() => { if (shouldPlay() && video.paused) setFallbackReason('autoplay-denied'); }, 1500);
          } else setFallbackReason('autoplay-denied');
        } else if (retryOnce && error.name === 'AbortError' && shouldPlay()) {
          retryFrame = requestAnimationFrame(() => startPlayback(false));
        }
      }).finally(() => { if (attempt === playAttempt) pending = false; });
    };
    const syncPlayback = () => {
      if (shouldPlay()) startPlayback();
      else { cancelAnimationFrame(retryFrame); video.pause(); lastProgress = performance.now(); }
    };
    const refreshVisibility = () => {
      const rect = hero.getBoundingClientRect();
      inView = rect.bottom > 0 && rect.top < window.innerHeight;
      // Retry a transient media failure only on a new entry, restore, or user gesture.
      if (shouldPlay() && video.error) {
        setVideoFailed(false);
        setVideoReady(false);
        video.load();
      }
      syncPlayback();
    };
    const onBridgeReady = () => {
      bridgeReady = true;
      clearTimeout(bridgeTimer);
      const rect = hero.getBoundingClientRect();
      inView = rect.bottom > 0 && rect.top < window.innerHeight;
      // Keep play() on the host-event stack, even if its earlier promise is pending.
      startPlayback(true, true);
    };
    const onPlaying = () => { clearTimeout(bridgeTimer); syncPlayback(); };
    refreshVisibility();
    const observer = new IntersectionObserver(([entry]) => {
      const wasInView = inView;
      inView = entry.isIntersecting;
      if (inView && !wasInView) refreshVisibility();
      else syncPlayback();
    }, { threshold: 0 });
    observer.observe(hero);
    video.addEventListener('canplay', syncPlayback);
    video.addEventListener('loadeddata', syncPlayback);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', syncPlayback);
    document.addEventListener('visibilitychange', refreshVisibility);
    document.addEventListener('WeixinJSBridgeReady', onBridgeReady);
    window.addEventListener('pageshow', refreshVisibility);
    window.addEventListener('pointerdown', refreshVisibility, { passive: true });
    // Some mobile hosts never settle play(); measure progress, not just a resolved promise.
    const watchdog = window.setInterval(() => {
      const now = performance.now();
      if (!shouldPlay() || Math.abs(video.currentTime - lastTime) > 0.01) lastProgress = now;
      lastTime = video.currentTime;
      if (shouldPlay() && now - lastProgress >= 4000) setFallbackReason('no-frame-progress');
    }, 500);
    return () => {
      disposed = true;
      clearInterval(watchdog);
      clearTimeout(bridgeTimer);
      cancelAnimationFrame(retryFrame);
      observer.disconnect();
      video.removeEventListener('canplay', syncPlayback);
      video.removeEventListener('loadeddata', syncPlayback);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', syncPlayback);
      document.removeEventListener('visibilitychange', refreshVisibility);
      document.removeEventListener('WeixinJSBridgeReady', onBridgeReady);
      window.removeEventListener('pageshow', refreshVisibility);
      window.removeEventListener('pointerdown', refreshVisibility);
      video.pause();
    };
  }, [reduceMotion, fallbackReason]);

  return (
    <section ref={heroRef} className={`hero${site.hero.media.video ? " hero--video" : ""}`} id="home" data-nav-section="home" data-media-fallback={fallbackReason || undefined} aria-label="Homepage introduction">
      <img className="hero-photo" src={site.hero.media.poster} alt="" fetchPriority="high" aria-hidden="true" />
      {site.hero.media.video && !reduceMotion && !fallbackReason && (
        <video ref={videoRef} className="hero-video" autoPlay muted loop playsInline src={site.hero.media.video}
          preload="auto" poster={site.hero.media.poster} disablePictureInPicture tabIndex={-1} aria-hidden="true"
          data-ready={videoReady && !videoFailed}
          data-failed={videoFailed}
          onPlaying={() => { setVideoReady(true); setVideoFailed(false); }}
          onTimeUpdate={(event) => {
            // Cached WebKit playback can start before the playing handler observes it.
            const video = event.currentTarget;
            if (!video.paused && video.readyState >= 2 && video.currentTime > 0) {
              setVideoReady(true);
              setVideoFailed(false);
            }
          }}
          onError={() => { setVideoFailed(true); setVideoReady(false); }} />
      )}
      {site.hero.media.video && !reduceMotion && fallbackReason && (
        <Suspense fallback={null}><AnimatedHeroFallback src={site.hero.media.video} /></Suspense>
      )}
      {!reduceMotion && !site.hero.media.video && <Suspense fallback={null}><HeroScene /></Suspense>}
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-content">
        <h1>{site.hero.title}</h1>
        <p className="hero-specialty">
          <TypewriterLine prefix={site.hero.prefix} words={site.hero.words} />
        </p>
      </div>
      <a className="scroll-cue" href="#about" aria-label="Scroll to about">
        <ChevronDown size={42} strokeWidth={2.2} />
      </a>
    </section>
  );
}
