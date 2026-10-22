// Private visitor log (Cloudflare Worker + D1, see HANDOFF.md). Per page view it records the device and
// network context, then what the visitor does: seconds on each section and on each paper/project/career entry,
// scroll depth, clicks, opened dialogs, copied text, embedded-video focus, errors and load timing.
// Only on the live domain (or a local endpoint given by VITE_VISITS_ENDPOINT), so ordinary dev runs are not logged.
// Open https://renjun.one/?me once in a browser to mark it as the owner's (hidden in the log by default).
import { inLookEditor } from "./lookEditor";

const LOCAL_ENDPOINT = import.meta.env.VITE_VISITS_ENDPOINT as string | undefined;
const ENDPOINT = LOCAL_ENDPOINT || "https://stats.renjun.one/v";
const LIVE_HOSTS = new Set(["renjun.one", "www.renjun.one"]);
const FLUSH_MS = 10_000;           // periodic flush, so in-app browsers that never fire pagehide still report
const ACTIVE_WINDOW_MS = 15_000;   // counts as active time this long after the last interaction
const MAX_EVENTS = 300;            // per view
const MAX_ERRORS = 5;
const SCROLL_MARKS = [25, 50, 75, 90, 100];

type Ev = { t: number; type: string; target?: string; label?: string; context?: string; value?: number; extra?: string };
type Dwell = { kind: string; label: string; ms: number };
type View = {
  pid: string; vid: string; start: number; visibleSince: number | null; visibleMs: number; activeMs: number;
  scroll: number; events: Ev[]; logged: number; errors: number; dwell: Map<string, Dwell>; lastSent: string;
};

let current: View | null = null;
let firstView = true;              // only the landing view carries the external referrer and query
let lastInteraction = 0;
let lastTick = 0;
let started = false;
const openDialogs = new Map<HTMLDialogElement, { label: string; kind: string; since: number }>();

const randomId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 24);
const clip = (value: unknown, n: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function storage(key: string, value?: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.(ENDPOINT, body)) return;
  } catch { /* fall through */ }
  fetch(ENDPOINT, { method: "POST", body, keepalive: true, mode: "no-cors" }).catch(() => {});
}

function push(event: Omit<Ev, "t">) {
  if (!current || current.logged >= MAX_EVENTS) return;
  current.logged++;
  current.events.push({ t: Date.now() - current.start, ...event });
  if (current.events.length >= 25) flush();
}

// Visible seconds, active seconds, deepest scroll, events and per-target dwell since the last flush.
function flush(final = false) {
  const view = current;
  if (!view) return;
  tick();
  if (final && view.visibleSince !== null) {
    view.visibleMs += Date.now() - view.visibleSince;
    view.visibleSince = null;
  }
  const visible = view.visibleMs + (view.visibleSince !== null ? Date.now() - view.visibleSince : 0);
  const dwell: [string, string, string, number][] = [];
  view.dwell.forEach((entry, target) => {
    const seconds = Math.floor(entry.ms / 1000);
    if (seconds > 0) {
      dwell.push([target, entry.kind, entry.label, seconds]);
      entry.ms -= seconds * 1000;
    }
  });
  const events = view.events.splice(0, view.events.length);
  const state = `${Math.round(visible / 1000)}|${Math.round(view.activeMs / 1000)}|${view.scroll}`;
  if (!events.length && !dwell.length && state === view.lastSent) return;
  view.lastSent = state;
  send({ kind: "batch", pid: view.pid, vid: view.vid, seconds: Math.round(visible / 1000), active: Math.round(view.activeMs / 1000),
    scroll: view.scroll, events, dwell });
}

// Nearest tracked thing around an element: a paper, project or career entry, else the page section.
function itemOf(element: Element | null): { key: string; kind: string; label: string } | null {
  const item = element?.closest<HTMLElement>("[data-publication-id], [data-track-item]");
  if (!item) return null;
  const key = item.dataset.publicationId ? `pub:${item.dataset.publicationId}` : item.dataset.trackItem!;
  const label = clip(item.querySelector("h1, h2, h3, .showcase-title")?.textContent || key, 140);
  return { key, kind: key.split(":")[0], label };
}

function sectionOf(element: Element | null) {
  const section = element?.closest<HTMLElement>("section, footer, header.site-header");
  if (!section) return "";
  return section.id || section.dataset.trackSection || (section.tagName === "FOOTER" ? "footer" : section.classList[0] || "");
}

function contextOf(element: Element | null) {
  return itemOf(element)?.key || sectionOf(element);
}

// Once a second while visible: active time, and which section / items / dialog the visitor is looking at.
function tick() {
  const view = current;
  const now = Date.now();
  const delta = Math.min(now - lastTick, 2_000);
  lastTick = now;
  if (!view || document.visibilityState !== "visible" || delta <= 0) return;
  syncDialogs();
  if (now - lastInteraction < ACTIVE_WINDOW_MS) view.activeMs += delta;
  const add = (target: string, kind: string, label: string) => {
    const entry = view.dwell.get(target) ?? { kind, label, ms: 0 };
    entry.ms += delta;
    view.dwell.set(target, entry);
  };
  if (openDialogs.size) {
    openDialogs.forEach((dialog) => add(`dialog:${dialog.kind}:${dialog.label}`.slice(0, 160), "dialog", dialog.label));
    return;
  }
  if (innerHeight <= 0) return;
  const middle = innerHeight * 0.4;
  const sections = document.querySelectorAll<HTMLElement>("#main-content > section, #main-content section[id], .site-footer");
  for (const section of sections) {
    const box = section.getBoundingClientRect();
    if (box.top <= middle && box.bottom > middle) {
      const id = sectionOf(section);
      if (id) add(`section:${id}`, "section", id);
      break;
    }
  }
  document.querySelectorAll<HTMLElement>("[data-publication-id], [data-track-item]").forEach((element) => {
    const box = element.getBoundingClientRect();
    const shown = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
    if (box.height > 0 && shown / Math.min(box.height, innerHeight) >= 0.6) {
      const item = itemOf(element);
      if (item) add(item.key, item.kind, item.label);
    }
  });
}

function onScroll() {
  lastInteraction = Date.now();
  const view = current;
  if (!view) return;
  const height = document.documentElement.scrollHeight;
  if (height <= 0 || innerHeight <= 0) return; // not laid out yet (prerender, hidden webview)
  const percent = Math.min(100, Math.round(((scrollY + innerHeight) / height) * 100));
  if (percent <= view.scroll) return;
  for (const mark of SCROLL_MARKS) if (view.scroll < mark && percent >= mark) push({ type: "scroll", value: mark });
  view.scroll = percent;
}

function describeClick(event: MouseEvent) {
  const element = (event.target as Element | null)?.closest<HTMLElement>("a, button, [role=button], summary, input, select, textarea, label");
  if (!element) return;
  const label = clip(element.getAttribute("aria-label") || element.textContent || element.getAttribute("title") || "", 120);
  const context = contextOf(element);
  const extra = event.type === "auxclick" || event.ctrlKey || event.metaKey ? "new-tab" : undefined;
  if (element instanceof HTMLAnchorElement && element.href) {
    const url = new URL(element.href, location.href);
    const kind = url.protocol === "mailto:" ? "mailto" : url.protocol === "tel:" ? "tel"
      : /\.(pdf|zip|bib|pptx?|docx?)$/i.test(url.pathname) || element.hasAttribute("download") ? "download"
      : url.origin !== location.origin ? "outbound" : url.hash && url.pathname === location.pathname ? "anchor" : "internal";
    push({ type: "click", target: clip(element.href, 300), label, context, extra: [kind, extra].filter(Boolean).join(",") });
  } else {
    push({ type: "click", target: element.tagName.toLowerCase(), label, context, extra });
  }
}

function dialogInfo(dialog: HTMLDialogElement) {
  const labelledBy = dialog.getAttribute("aria-labelledby");
  const raw = (labelledBy && document.getElementById(labelledBy)?.textContent) || dialog.getAttribute("aria-label") || "";
  const kind = dialog.classList.contains("image-lightbox") ? "image" : dialog.classList.contains("project-dialog") ? "project" : "dialog";
  return { kind, label: clip(raw.replace(/^Enlarged image:\s*/i, ""), 140) };
}

// Lightbox and project dialogs: open/close with how long each stayed open (also catches a dialog unmounted by a route change).
function syncDialogs() {
  const close = (dialog: HTMLDialogElement, known: { label: string; kind: string; since: number }) => {
    openDialogs.delete(dialog);
    push({ type: "dialog_close", target: known.kind, label: known.label || dialogInfo(dialog).label,
      value: Math.round((Date.now() - known.since) / 1000) });
  };
  openDialogs.forEach((known, dialog) => { if (!dialog.isConnected) close(dialog, known); });
  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
    const known = openDialogs.get(dialog);
    if (dialog.open && !known) {
      const info = dialogInfo(dialog);
      openDialogs.set(dialog, { ...info, since: Date.now() });
      push({ type: "dialog_open", target: info.kind, label: info.label });
    } else if (!dialog.open && known) {
      close(dialog, known);
    }
  });
}

function environment(highEntropy: Record<string, unknown> | null) {
  type Connection = { type?: string; effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
  const nav = navigator as Navigator & { connection?: Connection; deviceMemory?: number; globalPrivacyControl?: boolean };
  const connection = nav.connection;
  return JSON.stringify({
    langs: navigator.languages?.join(","), vp: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio,
    dark: matchMedia("(prefers-color-scheme: dark)").matches, rm: matchMedia("(prefers-reduced-motion: reduce)").matches,
    touch: navigator.maxTouchPoints, cores: navigator.hardwareConcurrency, mem: nav.deviceMemory,
    conn: connection && { type: connection.type, eff: connection.effectiveType, down: connection.downlink, rtt: connection.rtt, save: connection.saveData },
    tzo: -new Date().getTimezoneOffset(), dnt: navigator.doNotTrack, gpc: nav.globalPrivacyControl, hist: history.length,
    ch: highEntropy,
  });
}

// Chromium only (Android model, Windows 10 vs 11, full browser version); everywhere else this is null.
const highEntropy: Promise<Record<string, unknown> | null> = (async () => {
  type UAData = { getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>> };
  const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  if (!data?.getHighEntropyValues) return null;
  try {
    const values = await data.getHighEntropyValues(["platform", "platformVersion", "model", "mobile", "architecture", "fullVersionList"]);
    const brands = (values.fullVersionList as { brand: string; version: string }[] | undefined)
      ?.filter((brand) => !/Not.?A.?Brand/i.test(brand.brand)).map((brand) => `${brand.brand} ${brand.version}`).join(", ");
    return { platform: values.platform, platformVersion: values.platformVersion, model: values.model, mobile: values.mobile,
      arch: values.architecture, brands };
  } catch {
    return null;
  }
})();

function reportPerformance() {
  let lcp = 0;
  try {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) lcp = Math.round(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch { /* not supported */ }
  const report = () => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;
    push({ type: "perf", value: Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd), extra: JSON.stringify({
      ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
      lcp, transfer: nav.transferSize, protocol: nav.nextHopProtocol }) });
  };
  if (document.readyState === "complete") setTimeout(report, 3_000);
  else addEventListener("load", () => setTimeout(report, 3_000), { once: true });
}

function start() {
  if (started) return;
  started = true;
  const mark = () => { lastInteraction = Date.now(); };
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(type, mark, { passive: true, capture: true });
  let lastMove = 0;
  addEventListener("pointermove", () => { const now = Date.now(); if (now - lastMove > 1_000) { lastMove = now; mark(); } }, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", (event) => { try { describeClick(event); } catch { /* never break the page */ } }, true);
  document.addEventListener("auxclick", (event) => { try { if (event.button === 1) describeClick(event); } catch { /* ignore */ } }, true);
  document.addEventListener("contextmenu", (event) => {
    const element = (event.target as Element | null)?.closest("a, img");
    if (element) push({ type: "longpress", target: clip((element as HTMLAnchorElement).href || (element as HTMLImageElement).currentSrc || "", 300),
      label: clip(element.getAttribute("alt") || element.textContent, 120), context: contextOf(element) });
  }, true);
  document.addEventListener("copy", () => {
    const selection = document.getSelection();
    const text = clip(selection?.toString(), 200);
    if (text) push({ type: "copy", label: text, context: contextOf(selection?.anchorNode?.parentElement ?? null) });
  });
  addEventListener("blur", () => setTimeout(() => {
    const frame = document.activeElement;
    if (frame instanceof HTMLIFrameElement) push({ type: "iframe", target: clip(frame.src, 300), label: clip(frame.title, 120), context: contextOf(frame) });
  }, 0));
  addEventListener("error", (event) => {
    if (!current || current.errors >= MAX_ERRORS) return;
    current.errors++;
    const element = event.target as HTMLElement | null;
    if (element && element !== (window as unknown) && "tagName" in element) {
      push({ type: "error", target: clip((element as HTMLImageElement).currentSrc || (element as HTMLImageElement).src, 300), label: `${element.tagName.toLowerCase()} failed to load` });
    } else {
      push({ type: "error", target: clip(`${event.filename}:${event.lineno}`, 300), label: clip(event.message, 200) });
    }
  }, true);
  addEventListener("unhandledrejection", (event) => {
    if (!current || current.errors >= MAX_ERRORS) return;
    current.errors++;
    push({ type: "error", target: "promise", label: clip((event.reason as Error)?.message ?? event.reason, 200) });
  });
  new MutationObserver(syncDialogs).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  document.addEventListener("visibilitychange", () => {
    if (!current) return;
    if (document.visibilityState === "hidden") {
      tick();
      if (current.visibleSince !== null) { current.visibleMs += Date.now() - current.visibleSince; current.visibleSince = null; }
      push({ type: "hide" });
      flush();
    } else {
      current.visibleSince = Date.now();
      lastTick = Date.now();
      push({ type: "show" });
    }
  });
  addEventListener("pagehide", () => { push({ type: "leave" }); flush(true); });
  setInterval(tick, 1_000);
  setInterval(() => flush(), FLUSH_MS);
  reportPerformance();
}

export async function trackPageView(path: string) {
  if ((!LOCAL_ENDPOINT && !LIVE_HOSTS.has(location.hostname)) || inLookEditor) return;
  try {
    const params = new URLSearchParams(location.search);
    if (params.has("me")) storage("rg-owner", "1");
    if (params.has("notme")) storage("rg-owner", null);
    const vid = storage("rg-vid") ?? storage("rg-vid", randomId()) ?? randomId();
    if (current) {
      push({ type: "route", target: path });
      flush(true);
    }
    const now = Date.now();
    current = { pid: randomId(), vid, start: now, visibleSince: document.visibilityState === "visible" ? now : null, visibleMs: 0,
      activeMs: 0, scroll: 0, events: [], logged: 0, errors: 0, dwell: new Map(), lastSent: "" };
    lastTick = now;
    lastInteraction = now;
    start();
    const landing = firstView;
    firstView = false;
    // A share tag (?s=… or utm_source=…) beats WeChat's own share marker (?from=timeline / groupmessage / singlemessage).
    const tag = params.get("s") || params.get("utm_source") || (params.get("from") ? `wechat:${params.get("from")}` : "");
    const pid = current.pid;
    const ch = await Promise.race([highEntropy, new Promise<null>((resolve) => setTimeout(() => resolve(null), 300))]);
    send({
      kind: "view", pid, vid, owner: storage("rg-owner") === "1", path,
      ref: landing && document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : "",
      query: landing ? clip(location.search + location.hash, 300) : clip(location.hash, 300), tag: landing ? clip(tag, 80) : "",
      lang: navigator.language, screen: `${screen.width}x${screen.height}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone, env: environment(ch),
    });
    onScroll();
  } catch { /* the log must never break the site */ }
}
