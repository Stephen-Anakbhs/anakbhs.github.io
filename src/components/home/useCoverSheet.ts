import { useEffect, useRef, type RefObject } from "react";
import type liquidGL from "liquid-gl";
import { closeMotion, openMotion } from "../ui/glassMorph";
import { coverBox, createCoverRenderer, type CoverRenderer, type CoverSource } from "./coverSheetRenderer";

// The homepage hero behaves like a lock-screen cover. At the top of the page, drag, swipe,
// scroll or page down and it lifts on a glass edge with the video still playing beneath. A
// drag released past the threshold carries on up and the next section comes in the way
// home-screen icons do, short of it the cover springs back; a wheel or trackpad notch sends it
// all the way at once. At About (or from the Home link anywhere below), the same gestures the
// other way pull a glass sheet down over the page, a snapshot of the page bending into its
// edge, and the video returns once the sheet is all the way down. Touch, trackpad, mouse
// wheel, mouse drag, keys and section links all drive it.
type Mode = "lift" | "return";
type Phase = "idle" | "drag" | "settle" | "commit" | "finish";
type Painter = typeof liquidGL.painter;

const SHARE = 0.3; // a drag released past this share of the screen completes
const FLICK = 450; // px/s: a flick completes from anywhere past FLICK_MIN
const FLICK_MIN = 24;
const SEND = 1200; // px/s: how a notch, key or link sets the cover going
const GLASS_IN = 56; // px of travel over which the glass rim appears
const CLEAR_IN = 120; // px of travel over which the hero's shade clears out of the glass
const POP_IN = ".section-heading, .about-text > p, .social-row > *, .about-portrait, .publication-item, .publication-index-link, .showcase-card";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (t: number) => t * t * (3 - 2 * t);
const settle = "cubic-bezier(0.2, 0.7, 0.3, 1)";
const pixelScale = () => Math.min(window.devicePixelRatio || 1, 2);

export function useCoverSheet(heroRef: RefObject<HTMLElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>, enabled: boolean, onLink: (href: string) => void) {
  const linkTarget = useRef(onLink);
  linkTarget.current = onLink;

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !hero || !canvas) return;
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
    let landedAt = 0;
    let lastY = window.scrollY;
    let listening = false;
    let link: string | null = null;
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
    const ready = () => window.scrollY <= 2 && free();
    const aboutTop = () => {
      const about = document.getElementById("about");
      if (!about) return null;
      return about.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(about).scrollMarginTop) || 0);
    };
    const atAbout = () => {
      const top = aboutTop();
      return top !== null && Math.abs(window.scrollY - top) <= 2 && free();
    };

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
            && (element.hasAttribute("data-liquid-ignore") || element.closest("[data-liquid-ignore]") !== null || standIn(element) || offScreen(element)),
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
      if (link) linkTarget.current(link);
      link = null;
      landedAt = performance.now();
      syncInput();
      const next = pendingLink;
      pendingLink = null;
      if (!next) return;
      // A link clicked mid-transition: chain the next transition from here, or just go there.
      const chain = next === "home" ? window.scrollY > 2 && free() : ready() && Boolean(document.getElementById(next)?.closest("main"));
      if (chain) {
        mode = next === "home" ? "return" : "lift";
        link = `/#${next}`;
        begin();
        commit(SEND);
      } else linkTarget.current(`/#${next}`);
    };

    const finish = () => {
      phase = "finish";
      holdAnchor();
      if (mode === "return") {
        const veil = returnLive ? sheet : pane;
        window.scrollTo({ top: 0, behavior: "instant" });
        reset();
        popIn([content?.querySelector("h1"), content?.querySelector(".hero-specialty")].filter((item): item is HTMLElement => Boolean(item)), 1.12);
        cue?.animate({ opacity: [0, 1] }, { duration: 320, delay: 160, easing: settle, fill: "backwards" });
        fadeOut(veil, [{ opacity: 1 }, { opacity: 0 }], finished);
        return;
      }
      const ghost = hero.dataset.cover === "lift";
      if (ghost) hero.dataset.cover = "ghost";
      // Gestures land on About; a link lands on its own section, which then comes in the same way.
      const section = document.getElementById(link ? link.slice(link.indexOf("#") + 1) : "about");
      section?.scrollIntoView({ block: "start", behavior: "instant" });
      reset();
      if (section) popIn(section.querySelectorAll<HTMLElement>(POP_IN), 1.22);
      document.querySelector(".site-backdrop")?.animate({ transform: ["scale(1.08)", "none"] },
        { duration: closeMotion.duration + 200, easing: closeMotion.easing });
      if (ghost) fadeOut(canvas, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.04)" }], finished);
      else finished();
    };

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
    // Brings the cover down from About over the current view, from wherever the page was.
    const returnFrom = (top: number) => {
      if (window.scrollY !== top) window.scrollTo({ top, behavior: "instant" });
      lastY = top;
      mode = "return";
      begin();
      commit(SEND);
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
      if (delta > 0 && ready()) mode = "lift";
      else if (delta < 0 && atAbout()) mode = "return";
      else {
        // A notch that would carry the page up past About stops there and brings the cover down.
        const top = delta < 0 && free() ? aboutTop() : null;
        if (top !== null && window.scrollY > top + 2 && window.scrollY + delta < top) {
          event.preventDefault();
          returnFrom(top);
        }
        return;
      }
      // One notch or flick sends the cover all the way; only a grab moves it by hand.
      event.preventDefault();
      begin();
      commit(SEND);
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
        if (ready() && hero.contains(event.target)) next = "lift";
        else if (atAbout()) next = "return";
        else return;
      }
      drag = { id: point.identifier, touch: true, mode: next, x: point.clientX, y: point.clientY, base: regrab ? offset : 0, travel: 0 };
      if (regrab) { phase = "drag"; samples = []; }
    };
    const onTouchMove = (event: TouchEvent) => {
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
        mode = drag.mode;
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
      if (!(event.target instanceof Element) || !hero.contains(event.target) || event.target.closest("a, button")) return;
      if (phase === "idle" && !ready()) return;
      event.preventDefault(); // keep the drag from selecting the title
      drag = { id: event.pointerId, touch: false, mode: "lift", x: event.clientX, y: event.clientY, base: regrab ? offset : 0, travel: 0 };
      if (regrab) { phase = "drag"; samples = []; }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.touch || event.pointerId !== drag.id) return;
      const travel = drag.y - event.clientY;
      if (phase !== "drag") {
        if (travel < 4) return;
        mode = "lift";
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
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const focus = event.target;
      if (focus instanceof HTMLElement && (focus.isContentEditable || focus.closest("a, button, input, textarea, select, [role='button']"))) return;
      const down = event.key === "PageDown" || event.key === "ArrowDown" || (event.key === " " && !event.shiftKey);
      const up = event.key === "PageUp" || event.key === "ArrowUp" || event.key === "Home" || (event.key === " " && event.shiftKey);
      if (phase !== "idle") return;
      if (down && ready()) mode = "lift";
      else if (up && atAbout()) mode = "return";
      else return;
      event.preventDefault();
      begin();
      commit(SEND);
    };

    // From the top, any link to a section of this page lifts the cover first, then lands on that
    // section; from anywhere below, the Home link brings the cover down over the current view.
    // Other links behave as before.
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
      if (id === "home" && window.scrollY > 2 && free()) mode = "return";
      else if (id !== "home" && ready()) mode = "lift";
      else return;
      event.preventDefault();
      event.stopPropagation();
      link = `/#${id}`;
      document.dispatchEvent(new CustomEvent("rg-section-select", { detail: id }));
      begin();
      commit(SEND);
    };

    // Scrolling up out of About toward the hero, however it was scrolled (wheel inertia, scrollbar,
    // a Home link from further down), stops at About and brings the cover down from there instead.
    const onScroll = () => {
      const y = window.scrollY;
      const top = aboutTop();
      if (phase === "idle" && top !== null && y > 2 && y < top - 1 && lastY >= top - 1 && free()) {
        returnFrom(top);
        return;
      }
      lastY = y;
      syncInput();
    };
    const onImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.closest("main")) snapshot = null;
    };

    // Wheel and touch-move listeners that can cancel scrolling make every scroll wait for the
    // main thread, so they are only on while the cover can respond: at the top, from About to a
    // screen below it (where a notch can carry the page up past it), or during a gesture.
    const syncInput = () => {
      const top = aboutTop();
      const nearAbout = top !== null && window.scrollY >= top - 2 && window.scrollY <= top + window.innerHeight;
      const wanted = phase !== "idle" || window.scrollY <= 2 || nearAbout;
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
    // Elsewhere a passive wheel listener still catches a notch that would cross About.
    const onWheelPassive = (event: WheelEvent) => { if (!listening) onWheel(event); };

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
    syncInput();
    return () => {
      disposed = true;
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
      root.style.removeProperty("overflow-anchor");
      delete hero.dataset.coverGrab;
      clear();
      sheet.remove();
      pane.remove();
    };
  }, [heroRef, canvasRef, enabled]);
}
