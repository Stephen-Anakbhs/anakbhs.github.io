import { useSyncExternalStore } from "react";

// "Domain randomization": each scene pairs a wallpaper with a heading glass tint and font. Every wallpaper
// is cropped to the same 2560x1520 frame, which the heading glass aligns to (liquidHeading.ts).
export type SceneMode = "light" | "dark";
export type Scene = {
  id: string;
  name: string;
  mode: SceneMode;
  image: string;
  /** Low-contrast copy for the readability "calm" lane; otherwise the wallpaper is calmed with a filter. */
  calm?: string;
  /** Page colour under the wallpaper while it loads. */
  base: string;
  /** Heading glass tint (also the plain-text fallback colour). */
  glass: string;
  /** Light scenes: how much backdrop shows through untinted (higher = paler glass). */
  clarity?: number;
  headingFont: "Inter" | "Raleway";
};

// Photos (Unsplash License): glacier Heather Shevlin (photo-1504988102213), dune photo-1504548840739,
// night sea Max Muselmann (photo-1752058950030), silk photo-1686175600613, labradorite THLT LCX
// (photo-1611071821769). Cold stone: Scott Webb. Silver crystal reuses the site's earlier silver-strata crop.
export const scenes: Scene[] = [
  { id: "stone", name: "Cold Stone", mode: "light", image: "/media/cold-stone.webp", calm: "/media/cold-stone-calm.webp", base: "#d2d4d4", glass: "#c0262d", clarity: 0.42, headingFont: "Inter" },
  { id: "night-sea", name: "Night Sea", mode: "dark", image: "/media/scenes/night-sea.webp", base: "#0b1015", glass: "#8fd3ff", headingFont: "Raleway" },
  { id: "glacier", name: "Glacier", mode: "light", image: "/media/scenes/glacier.webp", base: "#e6ecef", glass: "#1d5fd0", headingFont: "Raleway" },
  { id: "silk", name: "Black Silk", mode: "dark", image: "/media/scenes/silk.webp", base: "#0c0c0d", glass: "#e8c37a", headingFont: "Inter" },
  { id: "dune", name: "Dune", mode: "light", image: "/media/scenes/dune.webp", base: "#cfccc6", glass: "#b2440f", headingFont: "Inter" },
  { id: "labradorite", name: "Labradorite", mode: "dark", image: "/media/scenes/labradorite.webp", base: "#0e1420", glass: "#f2b84b", headingFont: "Raleway" },
  { id: "silver-crystal", name: "Silver Crystal", mode: "light", image: "/media/scenes/silver-crystal.webp", base: "#d9dadb", glass: "#157f6e", headingFont: "Raleway" },
];

const STORAGE_KEY = "rg-scene";
const byId = (id: string | null | undefined) => scenes.find((scene) => scene.id === id);

function stored(): Scene {
  try {
    return byId(localStorage.getItem(STORAGE_KEY)) ?? scenes[0];
  } catch {
    return scenes[0];
  }
}

let current: Scene = typeof window === "undefined" ? scenes[0] : stored();
const listeners = new Set<() => void>();
const glassListeners = new Set<(scene: Scene) => void>();

/** Page-wide attributes and variables; called before the first render so a stored scene never flashes. */
export function applyScene(scene: Scene = current) {
  const root = document.documentElement;
  root.dataset.scene = scene.id;
  root.dataset.sceneMode = scene.mode;
  root.style.setProperty("--scene-wall", `url("${scene.image}")`);
  root.style.setProperty("--scene-base", scene.base);
  root.style.setProperty("--scene-glass", scene.glass);
  root.style.setProperty("--scene-heading-font", `"${scene.headingFont}"`);
  root.style.colorScheme = scene.mode;
  glassListeners.forEach((listener) => listener(scene));
}

export function setScene(scene: Scene) {
  if (scene.id === current.id) return;
  current = scene;
  try { localStorage.setItem(STORAGE_KEY, scene.id); } catch { /* private mode: keep it for this visit */ }
  applyScene(scene);
  listeners.forEach((listener) => listener());
}

/** Lets the heading glass filter follow the scene without importing React state. */
export function onSceneGlass(listener: (scene: Scene) => void) {
  glassListeners.add(listener);
  listener(current);
  return () => { glassListeners.delete(listener); };
}

// A shuffle bag per mode: each click flips light/dark and draws a scene not shown since the bag was refilled.
const bags: Record<SceneMode, Scene[]> = { light: [], dark: [] };
export function nextScene(from: Scene = current): Scene {
  const mode: SceneMode = from.mode === "light" ? "dark" : "light";
  if (!bags[mode].length) {
    bags[mode] = scenes.filter((scene) => scene.mode === mode).sort(() => Math.random() - 0.5);
  }
  return bags[mode].pop()!;
}

export function preloadScene(scene: Scene) {
  const image = new Image();
  image.decoding = "async";
  image.src = scene.image;
  return image.decode().catch(() => undefined);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useScene = () => useSyncExternalStore(subscribe, () => current, () => scenes[0]);
export const getScene = () => current;
