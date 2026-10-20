// One beacon per page view to the private visitor log (Cloudflare Worker, see HANDOFF.md), plus the
// visible time on that page when it is left. Only on the live domain, so local runs and tests are not logged.
// Open https://renjun.one/?me once in a browser to mark it as the owner's (hidden in the log by default).
const ENDPOINT = "https://stats.renjun.one/v"; // custom domain, so the beacon also works from mainland China
const LIVE_HOSTS = new Set(["renjun.one", "www.renjun.one"]);

type View = { pid: string; visibleSince: number | null; visibleMs: number };
let current: View | null = null;
let firstView = true;           // only the landing view carries the external referrer

const randomId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 24);

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

function flushTime() {
  if (!current) return;
  if (current.visibleSince !== null) {
    current.visibleMs += Date.now() - current.visibleSince;
    current.visibleSince = null;
  }
  if (current.visibleMs >= 1000) send({ kind: "time", pid: current.pid, seconds: Math.round(current.visibleMs / 1000) });
}

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushTime();
    else if (current) current.visibleSince = Date.now();
  });
  window.addEventListener("pagehide", flushTime);
}

export function trackPageView(path: string) {
  if (!LIVE_HOSTS.has(location.hostname)) return;
  const params = new URLSearchParams(location.search);
  if (params.has("me")) storage("rg-owner", "1");
  if (params.has("notme")) storage("rg-owner", null);
  const vid = storage("rg-vid") ?? storage("rg-vid", randomId());
  flushTime();
  current = { pid: randomId(), visibleSince: document.visibilityState === "visible" ? Date.now() : null, visibleMs: 0 };
  listen();
  send({
    kind: "view", pid: current.pid, vid, owner: storage("rg-owner") === "1", path,
    ref: firstView && document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : "",
    lang: navigator.language, screen: `${screen.width}x${screen.height}`,
  });
  firstView = false;
}
