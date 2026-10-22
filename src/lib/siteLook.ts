// Readability treatment chosen on the admin dashboard (stats.renjun.one, "网站外观"). The last known choice is
// applied before the first render and refreshed from the dashboard's public config; ?look=…&calm=… previews
// another treatment without saving it.
const ENDPOINT = "https://stats.renjun.one/site-config";
const LOOKS = new Set(["none", "vibrancy", "calm", "sheets"]);
const CACHE_KEY = "rg-look";

type Appearance = { look: string; calm: number };

function apply({ look, calm }: Appearance) {
  const root = document.documentElement;
  root.dataset.look = LOOKS.has(look) ? look : "none";
  const strength = Number.isFinite(calm) ? Math.max(0, Math.min(100, calm)) / 100 : 1;
  root.style.setProperty("--calm-strength", String(strength));
}

function cached(): Appearance | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return value && typeof value.look === "string" ? value : null;
  } catch {
    return null;
  }
}

export function initSiteLook() {
  const params = new URLSearchParams(location.search);
  const preview = params.get("look");
  if (preview && LOOKS.has(preview)) {
    apply({ look: preview, calm: Number(params.get("calm") ?? 100) });
    return;
  }
  apply(cached() ?? { look: "none", calm: 100 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  fetch(ENDPOINT, { signal: controller.signal, cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((value) => {
      if (!value || typeof value.look !== "string") return;
      const next = { look: value.look, calm: Number(value.calm) };
      apply(next);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    })
    .catch(() => { /* keep the cached or default look */ })
    .finally(() => clearTimeout(timer));
}
