import { onSceneGlass } from "../content/scenes";

// Readability treatment per scene, chosen on the admin dashboard (stats.renjun.one, "网站外观"): each wallpaper
// gets none | vibrancy | calm | sheets (+ calm strength). The last known config is applied before the first
// render, refreshed from the dashboard's public config, and re-applied whenever the scene changes.
// ?look=…&calm=… previews one treatment on every scene without saving it (with ?scene=… to pick the wallpaper).
const ENDPOINT = "https://stats.renjun.one/site-config";
const LOOKS = new Set(["none", "vibrancy", "calm", "sheets"]);
const CACHE_KEY = "rg-look";

type Appearance = { look: string; calm: number };
type Config = Appearance & { scenes?: Record<string, Appearance> };

let config: Config = { look: "none", calm: 100 };
let preview: Appearance | null = null;
let sceneId = "";

function apply() {
  const { look, calm } = preview ?? config.scenes?.[sceneId] ?? config;
  const root = document.documentElement;
  root.dataset.look = LOOKS.has(look) ? look : "none";
  const strength = Number.isFinite(Number(calm)) ? Math.max(0, Math.min(100, Number(calm))) / 100 : 1;
  root.style.setProperty("--calm-strength", String(strength));
}

function cached(): Config | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return value && typeof value.look === "string" ? value : null;
  } catch {
    return null;
  }
}

export function initSiteLook() {
  const params = new URLSearchParams(location.search);
  const look = params.get("look");
  if (look && LOOKS.has(look)) preview = { look, calm: Number(params.get("calm") ?? 100) };
  config = cached() ?? config;
  onSceneGlass((scene) => { sceneId = scene.id; apply(); });
  if (preview) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  fetch(ENDPOINT, { signal: controller.signal, cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((value) => {
      if (!value || typeof value.look !== "string") return;
      config = { look: value.look, calm: Number(value.calm), scenes: value.scenes && typeof value.scenes === "object" ? value.scenes : undefined };
      apply();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch { /* private mode */ }
    })
    .catch(() => { /* keep the cached or default look */ })
    .finally(() => clearTimeout(timer));
}
