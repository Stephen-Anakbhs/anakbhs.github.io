// One decision for how much optical work this device should do.
// "full": Chromium desktop with room to spare, where SVG refraction actually renders.
// "lite": phones, WebKit/Firefox (no SVG refraction over backdrops anyway), low-memory or
// few-core devices and data-saver connections. Lite keeps the glass look (blur, tint,
// rims, morphs) and drops per-pixel refraction and hover swell.
export type GlassQuality = "full" | "lite";

type DeviceHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
  userAgentData?: { brands?: { brand: string }[] };
};

function detect(): GlassQuality {
  if (typeof window === "undefined") return "lite";
  const hints = navigator as DeviceHints;
  const forced = new URLSearchParams(location.search).get("glass");
  if (forced === "full" || forced === "lite") return forced;
  const chromium = hints.userAgentData?.brands?.some(({ brand }) => brand === "Chromium") ?? false;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const lowMemory = (hints.deviceMemory ?? 8) < 4;
  const fewCores = (navigator.hardwareConcurrency ?? 8) < 4;
  const slowNetwork = hints.connection?.saveData === true || /(^|-)2g$/.test(hints.connection?.effectiveType ?? "");
  return chromium && !coarse && !lowMemory && !fewCores && !slowNetwork ? "full" : "lite";
}

export const glassQuality: GlassQuality = detect();
export const fullGlass = glassQuality === "full";

if (typeof document !== "undefined") document.documentElement.dataset.glassQuality = glassQuality;
