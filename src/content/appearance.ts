export type GlassMaterial = 'navigation' | 'selection' | 'overlay' | 'control' | 'logo' | 'media';
export type GlassTone = 'light' | 'dark';

export interface GlassAppearance {
  /** Background blur in CSS pixels. Foreground content stays sharp. */
  blurPx: number;
  saturation: number;
  displacementScale: number;
  aberrationIntensity: number;
  elasticity: number;
  cornerRadius: number;
  mode: 'standard' | 'polar' | 'prominent' | 'shader';
  overLight: boolean;
  fill: string;
  ink: string;
  hoverFill: string;
  highlightOpacity: number;
  shadow: string;
  padding: string;
}

export const glassAppearance: GlassAppearance = {
  blurPx: 1.5, saturation: 105, displacementScale: 22, aberrationIntensity: 0,
  elasticity: 0, cornerRadius: 24, mode: 'standard', overLight: false,
  fill: 'rgba(255, 255, 255, 0.065)', ink: '#fff', hoverFill: 'rgba(255, 255, 255, 0.1)',
  highlightOpacity: 0.38, shadow: '0 3px 12px rgba(0, 0, 0, 0.08)', padding: '0',
};

export const glassPresets: Record<GlassMaterial, Partial<GlassAppearance>> = {
  control: {},
  navigation: { cornerRadius: 26, blurPx: 0.5, displacementScale: 8, aberrationIntensity: 0, saturation: 105, fill: 'rgba(255, 255, 255, 0.055)', highlightOpacity: 0.3, shadow: '0 2px 8px rgba(18, 20, 24, 0.06)' },
  selection: { cornerRadius: 22, displacementScale: 18, fill: 'rgba(255, 255, 255, 0.14)', shadow: '0 3px 12px rgba(0, 0, 0, 0.09)' },
  overlay: { cornerRadius: 8, blurPx: 7, displacementScale: 16, fill: 'rgba(255, 255, 255, 0.14)', shadow: '0 4px 16px rgba(12, 18, 24, 0.1)' },
  logo: { cornerRadius: 8, blurPx: 0.5, displacementScale: 8, fill: 'rgba(239, 246, 249, 0.06)' },
  media: { cornerRadius: 8, blurPx: 0.5, displacementScale: 8, fill: 'rgba(236, 244, 249, 0.06)', padding: '12px' },
};

export function resolveGlassAppearance(material: GlassMaterial, tone: GlassTone, overrides: Partial<GlassAppearance> = {}): GlassAppearance {
  const appearance = { ...glassAppearance, ...glassPresets[material] };
  appearance.ink = tone === 'light' ? '#202428' : '#fff';
  for (const key of Object.keys(overrides) as (keyof GlassAppearance)[]) {
    if (overrides[key] !== undefined) Object.assign(appearance, { [key]: overrides[key] });
  }
  return appearance;
}
