// Values live in glass-settings.json (edited through Glass Studio); these are the shapes.
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
