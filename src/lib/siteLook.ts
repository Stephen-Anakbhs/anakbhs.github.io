import { getScene, onSceneGlass, preloadScene, scenes, setScene } from "../content/scenes";
import { inLookEditor } from "./lookEditor";

// Readability treatment per scene, chosen on the admin dashboard (stats.renjun.one, "网站外观"): each wallpaper
// gets none | vibrancy | calm | sheets (+ calm strength; sheet clarity and transparency, 0-100). The last known config is applied before the first
// render, refreshed from the dashboard's public config, and re-applied whenever the scene changes.
// ?look=…&calm=… previews one treatment on every scene without saving it (with ?scene=… to pick the wallpaper).
// Inside the dashboard's live editor the dashboard posts the unsaved config instead (see lookEditor.ts).
const ENDPOINT = "https://stats.renjun.one/site-config";
const EDITOR_ORIGINS = import.meta.env.DEV ? ["https://stats.renjun.one", "http://127.0.0.1:8789"] : ["https://stats.renjun.one"];
const LOOKS = new Set(["none", "vibrancy", "calm", "sheets"]);
const CACHE_KEY = "rg-look";

type Appearance = { look: string; calm: number; clarity?: number; transparency?: number };
type Config = Appearance & { scenes?: Record<string, Appearance> };

let config: Config = { look: "none", calm: 100 };
let preview: Appearance | null = null;
let sceneId = "";

function apply() {
  const { look, calm, clarity, transparency } = preview ?? config.scenes?.[sceneId] ?? config;
  const root = document.documentElement;
  root.dataset.look = LOOKS.has(look) ? look : "none";
  const strength = Number.isFinite(Number(calm)) ? Math.max(0, Math.min(100, Number(calm))) / 100 : 1;
  root.style.setProperty("--calm-strength", String(strength));
  // Sheets: clarity 100 = no blur, 0 = 40px; transparency 100 = no tint, 0 = opaque. Unset keeps the CSS default.
  const clear = percent(clarity), see = percent(transparency);
  if (clear === null) root.style.removeProperty("--sheet-blur");
  else root.style.setProperty("--sheet-blur", `${((100 - clear) * 0.4).toFixed(1)}px`);
  if (see === null) root.style.removeProperty("--sheet-alpha");
  else root.style.setProperty("--sheet-alpha", String((100 - see) / 100));
}

function percent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function configFrom(value: unknown): Config | null {
  const v = value as Config | null;
  if (!v || typeof v.look !== "string") return null;
  return { look: v.look, calm: Number(v.calm), scenes: v.scenes && typeof v.scenes === "object" ? v.scenes : undefined };
}

// Live editor: { type: "rg-look", config, scene? } from the dashboard sets the look (and the wallpaper) at once,
// keeping the scroll position; every scene change, including the visitor's own button, is reported back.
function followEditor() {
  window.addEventListener("message", (event) => {
    if (!EDITOR_ORIGINS.includes(event.origin) || event.data?.type !== "rg-look") return;
    config = configFrom(event.data.config) ?? config;
    apply();
    const target = scenes.find((scene) => scene.id === event.data.scene);
    if (target && target.id !== getScene().id) void preloadScene(target).then(() => setScene(target));
  });
  onSceneGlass((scene) => window.parent.postMessage({ type: "rg-scene", id: scene.id }, "*"));
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
  if (look && LOOKS.has(look)) {
    preview = { look, calm: Number(params.get("calm") ?? 100), clarity: percent(params.get("clarity")) ?? undefined,
      transparency: percent(params.get("transparency")) ?? undefined };
  }
  config = cached() ?? config;
  onSceneGlass((scene) => { sceneId = scene.id; apply(); });
  if (inLookEditor) return followEditor();
  if (preview) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  fetch(ENDPOINT, { signal: controller.signal, cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((value) => {
      const next = configFrom(value);
      if (!next) return;
      config = next;
      apply();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch { /* private mode */ }
    })
    .catch(() => { /* keep the cached or default look */ })
    .finally(() => clearTimeout(timer));
}
