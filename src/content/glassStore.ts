import { useSyncExternalStore } from 'react';
import initial from './glass-settings.json';
import { rgba, type GlassProfiles, type GlassSettings, type GlassType } from './glassSchema';
import type { GlassAppearance, GlassTone } from './appearance';

let state = initial as GlassSettings;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function replaceGlassSettings(next: GlassSettings) {
  const profiles = Object.fromEntries(Object.entries(next.profiles).map(([key, value]) =>
    [key, JSON.stringify(value) === JSON.stringify(state.profiles[key as GlassType]) ? state.profiles[key as GlassType] : value])) as GlassProfiles;
  state = { ...next, profiles };
  listeners.forEach(fn => fn());
}
export function previewGlass(profiles: GlassProfiles) {
  replaceGlassSettings({ ...state, profiles });
  if (import.meta.hot) import.meta.hot.send('glass:preview', profiles);
}
export function useGlassSettings() { return useSyncExternalStore(subscribe, () => state); }
export function useGlassProfile(type: GlassType) { return useSyncExternalStore(subscribe, () => state.profiles[type]); }
if (import.meta.hot) {
  import.meta.hot.on('glass:preview', (profiles: GlassProfiles) => replaceGlassSettings({ ...state, profiles }));
  import.meta.hot.send('glass:ready');
  import.meta.hot.accept('./glass-settings.json', module => { if (module) replaceGlassSettings(module.default as GlassSettings); });
}
export function surfaceAppearance(type: GlassType, tone: GlassTone): GlassAppearance {
  const p = state.profiles[type];
  return {
    blurPx: Number(p.blurPx), saturation: Number(p.saturation), displacementScale: Number(p.displacementScale),
    aberrationIntensity: Number(p.aberrationIntensity), elasticity: Number(p.elasticity), cornerRadius: Number(p.cornerRadius),
    mode: p.mode as GlassAppearance['mode'], overLight: Boolean(p.overLight),
    fill: rgba(String(p.fillColor), Number(p.fillOpacity)), ink: String(tone === 'light' ? p.inkLight : p.inkDark),
    hoverFill: rgba(String(p.hoverColor), Number(p.hoverOpacity)), highlightOpacity: Number(p.highlightOpacity),
    shadow: `0 ${p.shadowY}px ${p.shadowBlur}px ${rgba(String(p.shadowColor), Number(p.shadowOpacity))}`, padding: `${p.paddingPx}px`,
  };
}
