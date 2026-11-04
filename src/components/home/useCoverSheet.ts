import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type liquidGL from "liquid-gl";
import { closeMotion, openMotion } from "../ui/glassMorph";
import { getView, isCoverHash, onViewChange, pageTop, setView } from "../../lib/siteView";
import { coverBox, createCoverRenderer, type CoverRenderer, type CoverSource } from "./coverSheetRenderer";

// The way between the homepage's two pages, the cover and the content (siteView.ts). The hero
// behaves like a lock-screen cover: drag, swipe, scroll or page down and it lifts on a glass edge
// with the video still playing beneath. A drag released past the threshold carries on up and the
// content comes in the way home-screen icons do, short of it the cover springs back; a wheel or
// trackpad notch sends it all the way at once. At the top of the content (or from the Home link
// anywhere in it), the same gestures the other way pull a glass sheet down over the page, a
// snapshot of the page bending into its edge, and the cover returns once the sheet is all the way
// down. Touch, trackpad, mouse wheel, mouse drag, keys, section links and Back/Forward all drive
// it; with reduced motion the same requests change the page at once.
type Mode = "lift" | "return";
type Phase = "idle" | "drag" | "settle" | "commit" | "finish";
type Painter = typeof liquidGL.painter;

const SHARE = 0.3; // a drag released past this share of the screen completes
const FLICK = 450; // px/s: a flick completes from anywhere past FLICK_MIN
const FLICK_MIN = 24;
const SEND = 1200; // px/s: how a notch, key or link sets the cover going
// A wheel turn at the top of the content is a new request only after this much quiet in the wheel stream
// and the scrolling: inertia that carried the page there must not also turn it over.
const FRESH_WHEEL = 140; // ms
const FRESH_SCROLL = 300; // ms
const TO_COVER = "/";
const TO_CONTENT = "/#about";
const GLASS_IN = 56; // px of travel over which the glass rim appears
const CLEAR_IN = 120; // px of travel over which the hero's shade clears out of the glass
const POP_IN = ".section-heading, .about-text > p, .social-row > *, .about-portrait, .publication-item, .publication-index-link, .showcase-card";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (t: number) => t * t * (3 - 2 * t);
const settle = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const pixelScale = () => Math.min(window.devicePixelRatio || 1, 2);
const instant = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const hold = (y: number) => { if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: "instant" }); };

/** `onLink` receives where a finished transition landed (`landed`), or a place still to be scrolled to. */
export function useCoverSheet(heroRef: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>, hash: string, onLink: (href: string, landed: boolean) => void) {
  const linkTarget = useRef(onLink);
  linkTarget.current = onLink;
  const followHash = useRef<(next: string) => void>(() => {});

  // Before the first paint, so the cover opens in its final place.
  useLayoutEffect(() => { if (getView() === "cover") hold(pageTop()); }, []);

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!hero || !canvas) return;
    const root = document.documentElement;
    const content = hero.querySelector<HTMLElement>(".hero-content");
    const cue = hero.querySelector<HTMLElement>(".scroll-cue");
    const overlay = hero.querySelector<HTMLElement>(".hero-overlay");
    const phoneLayout = matchMedia("(max-width: 640px)");
    // The sheet that comes back down over the page: glass over a snapshot of the page, or,
    // should the page painter be unavailable, a plain clear pane edged in light.
    const sheet = document.createElement("canvas");
    sheet.className = "cover-return";
    const pane = document.createElement("div");
    pane.className = "cover-return-plain";
    for (const element of [sheet, pane]) {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("data-liquid-ignore", "");
      document.body.append(element);
    }
    let disposed = false;
    let renderer: CoverRenderer | null = null;
    let returnRenderer: CoverRenderer | null = null;
    let returnLive = false;
    let painter: Painter | null = null;
    let snapshot: { canvas: HTMLCanvasElement; key: string } | null = null;
    let mode: Mode = "lift";
    let phase: Phase = "idle";
    let offset = 0;
    let velocity = 0;
    let height = 1;
    let frame = 0;
    let last = 0;
    let anchorTimer = 0;
    let swallowSign = 0; // wheel direction of the gesture under way, swallowed while its stream keeps coming
    let swallowEnd = 0;
    let lastWheel = 0;
    let lastScroll = 0;
    let landedAt = 0;
    let anchorY = 0; // where the page sits under a returning sheet
    let listening = false;
    let target: string | null = null; // the section a lift lands on (About unless a link says otherwise)
    let push: string | null = null; // the address to go to when the transition ends
    let currentHash = location.hash;
    let startHash = currentHash;
    let pendingLink: string | null = null; // a section link clicked during a transition, honored when it ends
    let samples: { time: number; offset: number }[] = [];
    let drag: { id: number; touch: boolean; mode: Mode; x: number; y: number; base: number; travel: number } | null = null;

    // Compile both renderers and load the page painter ahead of the first gesture so it does not hitch.
    const warm = window.setTimeout(() => {
      renderer ??= createCoverRenderer(canvas);
      returnRenderer ??= createCoverRenderer(sheet);
    }, 400);
    void import("liquid-gl").then(({ default: module }) => {
      if (!disposed && typeof module.painter?.measure === "function") painter = module.painter;
    });

    const free = () => !root.classList.contains("glass-dialog-open")
      && !(phoneLayout.matches && document.querySelector('.site-header[data-menu-open="true"]'));
    const ready = () => getView() === "cover" && free();
    const atPageTop = () => window.scrollY <= pageTop() + 2;
    const atTop = () => getView() === "content" && atPageTop() && free();

    const pickSource = (): CoverSource | null => {
      const video = hero.querySelector<HTMLVideoElement>("video.hero-video");
      if (video && video.readyState >= 2 && !video.error) return video;
      const fallback = hero.querySelector<HTMLCanvasElement>("canvas.hero-fallback");
      if (fallback && fallback.dataset.mediaReady !== "false") return fallback;
      const photo = hero.querySelector<HTMLImageElement>("img.hero-photo");
      return photo?.complete && photo.naturalWidth ? photo : null;
    };

    // The view the returning sheet comes down over, painted as the gesture starts (only what is
    // on screen, a few milliseconds) and kept while the view stays the same.
    const snapshotKey = () => [window.innerWidth, window.innerHeight, Math.round(window.scrollY),
      root.dataset.scene ?? "", root.dataset.sceneMode ?? "", root.dataset.look ?? ""].join("|");
    const takeSnapshot = () => {
      const key = snapshotKey();
      if (snapshot?.key === key) return snapshot.canvas;
      if (!painter) return null;
      const width = window.innerWidth;
      const viewport = window.innerHeight;
      const top = Math.round(window.scrollY);
      const scale = pixelScale();
      // The painter cannot do glass lettering or masked icons (and reads styles as it goes, so
      // they cannot be restyled for it quietly): it skips them, and they are drawn in afterward.
      const standIn = (element: Element) => element.matches(".section-heading :is(h1, h2), .brand-icon");
      const offScreen = (element: Element) => {
        if (element === document.body || getComputedStyle(element).position === "fixed") return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom < -4 || rect.top > viewport + 4;
      };
      let page: HTMLCanvasElement;
      try {
        const plan = painter.measure(document.body, {
          width, height: top + viewport, scale, backgroundColor: getComputedStyle(root).backgroundColor,
          ignoreElements: (element) => typeof element.hasAttribute === "function"
            && (element === hero || element.hasAttribute("data-liquid-ignore") || element.closest("[data-liquid-ignore]") !== null || standIn(element) || offScreen(element)),
        });
        if (!plan) return null;
        // Paint the viewport only: slide the page up by the scroll and keep a viewport-tall canvas.
        plan.height = viewport;
        plan.base[5] -= top * scale;
        page = painter.paint(plan, document.createElement("canvas"));
      } catch {
        return null;
      }
      drawStandIns(page, scale);
      snapshot = { canvas: page, key };
      return page;
    };
    // Glass lettering as solid lettering in its glass color, masked icons as their image in ink.
    const drawStandIns = (page: HTMLCanvasElement, scale: number) => {
      const context = page.getContext("2d");
      if (!context) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const onScreen = (rect: DOMRect) => rect.bottom > 0 && rect.top < window.innerHeight;
      for (const heading of document.querySelectorAll<HTMLElement>("main .section-heading :is(h1, h2)")) {
        const rect = heading.getBoundingClientRect();
        if (!onScreen(rect)) continue;
        const style = getComputedStyle(heading);
        const size = parseFloat(style.fontSize);
        context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
        context.fillStyle = style.color;
        context.textBaseline = "alphabetic";
        const metrics = context.measureText("Hg");
        const ascent = metrics.fontBoundingBoxAscent || size * 0.95;
        const descent = metrics.fontBoundingBoxDescent || size * 0.25;
        const lineHeight = parseFloat(style.lineHeight) || size * 1.3;
        // Greedy wrapping at spaces, the way the browser lays out these headings.
        const lines: string[] = [];
        let line = "";
        for (const word of (heading.textContent ?? "").split(/\s+/).filter(Boolean)) {
          const trial = line ? `${line} ${word}` : word;
          if (line && context.measureText(trial).width > rect.width + 0.5) { lines.push(line); line = word; }
          else line = trial;
        }
        if (line) lines.push(line);
        lines.forEach((text, index) => context.fillText(text, rect.left, rect.top + index * lineHeight + (lineHeight - ascent - descent) / 2 + ascent));
      }
      for (const icon of document.querySelectorAll<HTMLElement>("main .brand-icon")) {
        const rect = icon.getBoundingClientRect();
        const image = icon.querySelector("img");
        if (!onScreen(rect) || !image?.complete || !image.naturalWidth) continue;
        const tinted = document.createElement("canvas");
        tinted.width = Math.max(1, Math.ceil(rect.width * scale));
        tinted.height = Math.max(1, Math.ceil(rect.height * scale));
        const tint = tinted.getContext("2d");
        if (!tint) continue;
        tint.drawImage(image, 0, 0, tinted.width, tinted.height);
        tint.globalCompositeOperation = "source-in";
        tint.fillStyle = getComputedStyle(icon).color;
        tint.fillRect(0, 0, tinted.width, tinted.height);
        context.drawImage(tinted, rect.left, rect.top, rect.width, rect.height);
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
    };

    const begin = () => {
      offset = 0;
      velocity = 0;
      samples = [];
      const width = window.innerWidth;
      if (mode === "return") {
        height = window.innerHeight;
        anchorY = window.scrollY;
        const shot = takeSnapshot();
        if (shot) {
          if (returnRenderer?.lost) returnRenderer = null;
          returnRenderer ??= createCoverRenderer(sheet);
          returnRenderer?.layout({ width, height, scale: pixelScale(), source: shot, cover: [0, 0, width, height], live: false, shade: [0, 0, 0], seeThrough: true });
        }
        returnLive = Boolean(shot && returnRenderer && !returnRenderer.lost);
        return;
      }
      const box = hero.getBoundingClientRect();
      height = Math.max(1, box.height);
      if (renderer?.lost) renderer = null;
      renderer ??= createCoverRenderer(canvas);
      const style = overlay ? getComputedStyle(overlay) : null;
      const shade = (name: string, fallback: number) => parseFloat(style?.getPropertyValue(name) ?? "") || fallback;
      const source = pickSource();
      renderer?.layout({
        width: box.width, height, scale: pixelScale(), source, live: true, seeThrough: false,
        cover: source ? coverBox(source, box.width, height) : [0, 0, box.width, height],
        shade: [shade("--shade-start", 0.83), shade("--shade-mid", 0.36), shade("--shade-end", 0.2)],
      });
    };

    const reset = () => {
      for (const element of [content, cue, overlay]) {
        element?.style.removeProperty("transform");
        element?.style.removeProperty("opacity");
      }
    };
    const clear = () => {
      delete hero.dataset.cover;
      delete sheet.dataset.active;
      delete pane.dataset.active;
      pane.style.removeProperty("transform");
      reset();
    };

    const render = () => {
      if (offset <= 0 && (phase === "idle" || phase === "settle")) { clear(); return; }
      const glass = smooth(clamp(offset / GLASS_IN));
      const clearing = smooth(clamp(offset / CLEAR_IN));
      if (mode === "return") {
        if (returnLive && returnRenderer?.draw(offset, glass, 1)) {
          sheet.dataset.active = "";
          return;
        }
        pane.dataset.active = "";
        pane.style.transform = `translate3d(0, ${offset - height}px, 0)`;
        pane.style.setProperty("--rim", glass.toFixed(3));
        return;
      }
      if (renderer?.draw(height - offset, glass, clearing)) hero.dataset.cover = "lift";
      else if (overlay) {
        // Without WebGL the shade itself is the sheet, thinning as it lifts, edged with a highlight in CSS.
        hero.dataset.cover = "css";
        overlay.style.transform = `translate3d(0, ${-offset}px, 0)`;
        overlay.style.opacity = String(1 - 0.85 * clearing);
      }
      if (content) {
        content.style.transform = `translate3d(0, ${-offset}px, 0)`;
        content.style.opacity = String(1 - clamp((offset - height * 0.3) / (height * 0.4)));
      }
      if (cue) {
        cue.style.transform = `translate3d(-50%, ${-offset}px, 0)`;
        cue.style.opacity = String(1 - clamp(offset / 60));
      }
    };

    // Elements arrive like home-screen icons: from slightly in front of the screen, toward its
    // center, settling with the same spring as the glass sheets.
    const popIn = (items: Iterable<HTMLElement>, scale: number) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const reach = Math.hypot(centerX, centerY);
      for (const item of items) {
        const box = item.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) continue;
        const origin = `${centerX - box.left}px ${centerY - box.top}px`;
        const delay = (Math.hypot(box.left + box.width / 2 - centerX, box.top + box.height / 2 - centerY) / reach) * 80;
        item.animate({ transform: [`scale(${scale})`, "none"], transformOrigin: [origin, origin] },
          { duration: openMotion.duration, easing: openMotion.easing, delay, fill: "backwards" });
        item.animate({ opacity: [0, 1] }, { duration: 240, easing: settle, delay, fill: "backwards" });
      }
    };
    // Scroll anchoring would chase the transformed elements (WebKit) and drift the page.
    const holdAnchor = () => {
      root.style.overflowAnchor = "none";
      window.clearTimeout(anchorTimer);
      anchorTimer = window.setTimeout(() => root.style.removeProperty("overflow-anchor"), openMotion.duration + 200);
    };
    const fadeOut = (element: HTMLElement, keyframes: Keyframe[], done: () => void) => {
      const fade = element.animate(keyframes, { duration: 380, easing: settle, fill: "forwards" });
      fade.finished.then(() => { done(); fade.cancel(); }, done);
    };
    const finished = () => {
      phase = "idle";
      mode = "lift";
      offset = 0;
      velocity = 0;
      clear();
      const href = push;
      const unmoved = currentHash === startHash; // Back or Forward during the transition outranks its address
      push = null;
      target = null;
      if (href && unmoved) linkTarget.current(href, true);
      landedAt = performance.now();
      syncInput();
      const next = pendingLink;
      pendingLink = null;
      if (next) {
        // A link clicked mid-transition: chain the next transition from here, or just go there.
        if (next === "home" ? getView() === "content" && free() : ready() && document.getElementById(next)?.closest("main")) {
          turn(next === "home" ? "return" : "lift", next === "home" ? null : next, next === "home" ? TO_COVER : `/#${next}`);
        } else linkTarget.current(next === "home" ? TO_COVER : `/#${next}`, false);
        return;
      }
      if (!(href && unmoved)) followAddress(currentHash);
    };

    // Turns the page over, in one go, under whatever is on screen at this moment.
    const land = () => {
      holdAnchor();
      if (mode === "return") {
        setView("cover");
        hold(pageTop());
        if (document.activeElement instanceof HTMLElement && document.activeElement.closest("main")) document.activeElement.blur();
        reset();
        return null;
      }
      setView("content");
      // Gestures land on About; a link lands on its own section, which then comes in the same way.
      const section = document.getElementById(target ?? "about");
      section?.scrollIntoView({ block: "start", behavior: "instant" });
      const focused = document.activeElement;
      if (!focused || focused === document.body || hero.contains(focused)) document.getElementById("main-content")?.focus({ preventScroll: true });
      reset();
      return section;
    };

    const finish = () => {
      phase = "finish";
      const returning = mode === "return";
      const section = land();
      if (returning) {
        const veil = returnLive ? sheet : pane;
        popIn([content?.querySelector("h1"), content?.querySelector(".hero-specialty")].filter((item): item is HTMLElement => Boolean(item)), 1.12);
        cue?.animate({ opacity: [0, 1] }, { duration: 320, delay: 160, easing: settle, fill: "backwards" });
        fadeOut(veil, [{ opacity: 1 }, { opacity: 0 }], finished);
        return;
      }
      const ghost = hero.dataset.cover === "lift";
      if (ghost) hero.dataset.cover = "ghost";
      if (section) popIn(section.querySelectorAll<HTMLElement>(POP_IN), 1.22);
      document.querySelector(".site-backdrop")?.animate({ transform: ["scale(1.08)", "none"] },
        { duration: closeMotion.duration + 200, easing: closeMotion.easing });
      if (ghost) fadeOut(canvas, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.04)" }], finished);
      else finished();
    };

    const aim = (next: Mode, section: string | null, href: string | null) => {
      mode = next;
      target = section;
      push = href;
      startHash = currentHash;
    };
    // Sends the page over from a standing start.
    const turn = (next: Mode, section: string | null, href: string | null) => {
      aim(next, section, href);
      if (instant()) {
        phase = "finish";
        land();
        finished();
        return;
      }
      begin();
      commit(SEND);
    };
    // The address changed on its own (Back, Forward, a typed fragment): the page follows it.
    const followAddress = (next: string) => {
      currentHash = next;
      if (phase !== "idle" || isCoverHash(next) === (getView() === "cover")) return;
      for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) dialog.close();
      if (isCoverHash(next)) turn("return", null, null);
      else turn("lift", next.slice(1), null);
    };
    followHash.current = followAddress;

    const step = (dt: number) => {
      if (phase === "settle") {
        velocity += (-260 * offset - 30 * velocity) * dt;
        offset += velocity * dt;
        if (offset <= 0 || (offset < 0.5 && Math.abs(velocity) < 20)) { offset = 0; velocity = 0; phase = "idle"; }
      } else if (phase === "commit") {
        velocity += (190 * (height + 90 - offset) - 26 * velocity) * dt;
        offset = Math.min(height, offset + velocity * dt);
      }
    };
    const tick = (now: number) => {
      frame = 0;
      // Integrate the real elapsed time in small steps so slow frames do not slow the motion.
      let remaining = clamp((now - last) / 1000, 0, 0.1);
      last = now;
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 120);
        step(dt);
        remaining -= dt;
      }
      // Touch momentum can carry the page on under a returning sheet; hold it where the sheet started.
      if (mode === "return" && phase !== "idle") hold(anchorY);
      render();
      if (phase === "commit" && offset >= height) { finish(); return; }
      if (phase !== "idle") frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const commit = (speed: number) => {
      phase = "commit";
      velocity = Math.max(0, speed);
      // Swallow the rest of the wheel or trackpad stream that got us here, so its inertia does
      // not scroll on past the target. The stream ends at a pause in the events, a turn the
      // other way, or a time limit; the next turn is a new intent and acts at once.
      swallowSign = mode === "lift" ? 1 : -1;
      swallowEnd = performance.now() + 2500;
      lastWheel = performance.now();
      run();
    };
    const release = (speed: number) => {
      if (speed > -FLICK && (offset > height * SHARE || (speed > FLICK && offset > FLICK_MIN))) commit(speed);
      else { phase = "settle"; velocity = speed; run(); }
    };
    const recentSpeed = (now: number) => {
      const recent = samples.filter((sample) => now - sample.time < 90);
      if (recent.length < 2) return 0;
      const first = recent[0];
      const latest = recent[recent.length - 1];
      return now - latest.time > 60 ? 0 : ((latest.offset - first.offset) / Math.max(1, latest.time - first.time)) * 1000;
    };
    const follow = (next: number, time: number) => {
      offset = clamp(next, 0, height);
      samples.push({ time, offset });
      if (samples.length > 12) samples.shift();
      run();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1);
      const now = performance.now();
      const gap = now - lastWheel;
      lastWheel = now;
      if (phase === "commit" || phase === "finish") { event.preventDefault(); return; }
      // Right after landing, same-direction events are still the stream that got us here.
      const settling = now - landedAt < 400;
      if (swallowSign && (Math.sign(delta) !== swallowSign || (!settling && (now > swallowEnd || gap > 320)))) swallowSign = 0;
      if (swallowSign) { event.preventDefault(); return; }
      if (phase === "drag") {
        // A wheel turned mid-drag moves the same sheet instead of scrolling the page under it.
        event.preventDefault();
        if (drag) {
          drag.base += mode === "lift" ? delta : -delta;
          follow(drag.base + drag.travel, event.timeStamp);
        }
        return;
      }
      if (phase !== "idle") return;
      // One notch or flick sends the cover all the way; only a grab moves it by hand.
      if (delta > 0 && ready()) {
        event.preventDefault();
        turn("lift", null, TO_CONTENT);
      } else if (delta < 0 && gap > FRESH_WHEEL && now - lastScroll > FRESH_SCROLL && atTop()) {
        event.preventDefault();
        turn("return", null, TO_COVER);
      } else if (getView() === "cover") event.preventDefault();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        if (drag && phase === "drag") release(0);
        drag = null;
        return;
      }
      if (phase === "commit" || phase === "finish" || phase === "drag") return;
      const point = event.touches[0];
      const regrab = phase === "settle";
      let next: Mode = mode;
      if (!regrab) {
        if (!(event.target instanceof Element) || event.target.closest(".site-header > *")) return;
        if (ready()) next = "lift";
        else if (atTop()) next = "return";
        else return;
      }
      drag = { id: point.identifier, touch: true, mode: next, x: point.clientX, y: point.clientY, base: regrab ? offset : 0, travel: 0 };
      if (regrab) { phase = "drag"; samples = []; }
    };
    const onTouchMove = (event: TouchEvent) => {
      // Nothing scrolls under the cover.
      if (getView() === "cover" && event.touches.length === 1 && event.cancelable) event.preventDefault();
      if (!drag?.touch) return;
      const point = Array.from(event.changedTouches).find((item) => item.identifier === drag?.id);
      if (!point) return;
      const rise = drag.y - point.clientY;
      const travel = drag.mode === "lift" ? rise : -rise;
      if (phase !== "drag") {
        const drift = Math.abs(point.clientX - drag.x);
        if (Math.abs(travel) < 4 && drift < 4) return;
        // Movement the other way or sideways belongs to the page.
        if (travel <= 0 || drift > travel) { drag = null; return; }
        const direction = drag.mode;
        const href = direction === "lift" ? TO_CONTENT : TO_COVER;
        if (instant()) {
          if (travel > 40) { drag = null; event.preventDefault(); turn(direction, null, href); }
          return;
        }
        aim(direction, null, href);
        begin();
        phase = "drag";
      }
      event.preventDefault();
      drag.travel = travel;
      follow(drag.base + travel, event.timeStamp);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!drag?.touch || !Array.from(event.changedTouches).some((item) => item.identifier === drag?.id)) return;
      drag = null;
      if (phase === "drag") release(recentSpeed(event.timeStamp));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      const regrab = phase === "settle" && mode === "lift";
      if (!(phase === "idle" || regrab)) return;
      // Only the handle strip at the foot of the hero starts a mouse drag; the lettering stays selectable.
      if (!(event.target instanceof Element) || !event.target.closest(".hero-grab")) return;
      if (phase === "idle" && !ready()) return;
      event.preventDefault();
      if (instant()) { turn("lift", null, TO_CONTENT); return; }
      drag = { id: event.pointerId, touch: false, mode: "lift", x: event.clientX, y: event.clientY, base: regrab ? offset : 0, travel: 0 };
      if (regrab) { phase = "drag"; samples = []; }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.touch || event.pointerId !== drag.id) return;
      const travel = drag.y - event.clientY;
      if (phase !== "drag") {
        if (travel < 4) return;
        aim("lift", null, TO_CONTENT);
        begin();
        phase = "drag";
        hero.dataset.coverGrab = "";
      }
      drag.travel = travel;
      follow(drag.base + travel, event.timeStamp);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || drag.touch || event.pointerId !== drag.id) return;
      drag = null;
      delete hero.dataset.coverGrab;
      if (phase === "drag") release(event.type === "pointercancel" ? 0 : recentSpeed(event.timeStamp));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const focus = event.target;
      if (focus instanceof HTMLElement && (focus.isContentEditable || focus.closest("a, button, input, textarea, select, [role='button']"))) return;
      const down = event.key === "PageDown" || event.key === "ArrowDown" || event.key === "End" || (event.key === " " && !event.shiftKey);
      const up = event.key === "PageUp" || event.key === "ArrowUp" || event.key === "Home" || (event.key === " " && event.shiftKey);
      if (phase !== "idle") return;
      if (down && ready()) {
        event.preventDefault();
        turn("lift", null, TO_CONTENT);
      } else if (up && atTop()) {
        event.preventDefault();
        turn("return", null, TO_COVER);
      }
    };

    // On the cover, any link to a section of this page lifts the cover first, then lands on that
    // section; from anywhere in the content, the Home link brings the cover down over the current
    // view. Other links behave as before.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const href = event.target.closest("a[href]")?.getAttribute("href") ?? "";
      const id = /^\/?#([\w-]+)$/.exec(href)?.[1];
      if (!id || !(id === "home" || document.getElementById(id)?.closest("main"))) return;
      if (phase !== "idle") {
        // Mid-transition, the page must not scroll under the sheet: keep the link for the end.
        event.preventDefault();
        event.stopPropagation();
        pendingLink = id;
        document.dispatchEvent(new CustomEvent("rg-section-select", { detail: id }));
        return;
      }
      const returning = id === "home" && getView() === "content" && free();
      if (!returning && (id === "home" || !ready())) return;
      event.preventDefault();
      event.stopPropagation();
      document.dispatchEvent(new CustomEvent("rg-section-select", { detail: id }));
      if (returning) turn("return", null, TO_COVER);
      else turn("lift", id, `/#${id}`);
    };

    // The page stays put under the cover and under a returning sheet, however it was asked to move.
    const onScroll = () => {
      lastScroll = performance.now();
      if (getView() === "cover") hold(pageTop());
      else if (mode === "return" && phase !== "idle") hold(anchorY);
      syncInput();
    };
    const onImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.closest("main")) snapshot = null;
    };

    // Wheel and touch-move listeners that can cancel scrolling make every scroll wait for the
    // main thread, so they are only on while there is something to respond to: on the cover, at
    // the top of the content, or during a gesture.
    const syncInput = () => {
      const wanted = phase !== "idle" || getView() === "cover" || atPageTop();
      if (wanted === listening) return;
      listening = wanted;
      if (wanted) {
        window.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("touchmove", onTouchMove, { passive: false });
      } else {
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("touchmove", onTouchMove);
      }
    };
    // Below the top a passive listener keeps the wheel's timing, so the turn that follows a scroll
    // up to the top can tell whether it is still the same stream.
    const onWheelPassive = () => { if (!listening) lastWheel = performance.now(); };
    const keepInPlace = () => { if (getView() === "cover") hold(pageTop()); };
    const stopView = onViewChange(syncInput);

    window.addEventListener("wheel", onWheelPassive, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    hero.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("load", onImageLoad, true);
    window.addEventListener("resize", keepInPlace);
    window.addEventListener("pageshow", keepInPlace);
    syncInput();
    keepInPlace();
    return () => {
      disposed = true;
      followHash.current = () => {};
      stopView();
      window.clearTimeout(warm);
      window.clearTimeout(anchorTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", onWheelPassive);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      hero.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("load", onImageLoad, true);
      window.removeEventListener("resize", keepInPlace);
      window.removeEventListener("pageshow", keepInPlace);
      root.style.removeProperty("overflow-anchor");
      delete hero.dataset.coverGrab;
      clear();
      sheet.remove();
      pane.remove();
    };
  }, [heroRef, canvasRef]);

  useEffect(() => { followHash.current(hash); }, [hash]);
}
