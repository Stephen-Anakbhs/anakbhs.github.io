export const glassTypes = {
  control: { label: '文字按钮 · Website / Paper / Code', kind: 'surface', route: '/publications' },
  social: { label: '社交图标按钮', kind: 'surface', route: '/#about' },
  navigation: { label: '导航栏底面', kind: 'surface', route: '/' },
  toggle: { label: '导航开关', kind: 'surface', route: '/' },
  selection: { label: '导航选中透镜', kind: 'lens', route: '/' },
  overlay: { label: '项目悬浮遮罩', kind: 'surface', route: '/#projects' },
  logo: { label: '机构与社团 Logo 底面', kind: 'surface', route: '/#experience' },
  media: { label: '论文图片边框', kind: 'surface', route: '/publications' },
  portrait: { label: 'About 照片边框', kind: 'surface', route: '/#about' },
  scrollbar: { label: '桌面滚动条', kind: 'scrollbar', route: '/#about' },
} as const;
export type GlassType = keyof typeof glassTypes;
export type GlassProfile = Record<string, number | string | boolean>;
export type GlassProfiles = Record<GlassType, GlassProfile>;
export interface GlassPreset { id: string; name: string; profiles: GlassProfiles; locked?: boolean }
export interface GlassSettings { version: 1; profiles: GlassProfiles; presets: GlassPreset[] }
export type GlassField = { key: string; label: string; type: 'number' | 'color' | 'select' | 'boolean'; min?: number; max?: number; step?: number; unit?: string; options?: string[] };
const number = (key: string, label: string, min: number, max: number, step: number, unit = ''): GlassField => ({ key, label, type: 'number', min, max, step, unit });
const color = (key: string, label: string): GlassField => ({ key, label, type: 'color' });
const surfaceFields: GlassField[] = [
  number('blurPx', '背景模糊', 0, 30, 0.1, 'px'), number('displacementScale', '折射位移', 0, 80, 1),
  number('aberrationIntensity', '色散', 0, 5, 0.05), number('saturation', '背景饱和度', 0, 200, 1, '%'),
  { key: 'mode', label: '透镜模式', type: 'select', options: ['lens', 'standard', 'polar', 'prominent', 'shader'] },
  number('fillOpacity', '底色不透明度', 0, 1, 0.005), color('fillColor', '玻璃底色'),
  number('highlightOpacity', '边缘高光', 0, 1, 0.01),
  number('hoverOpacity', '悬停底色不透明度', 0, 1, 0.005), color('hoverColor', '悬停底色'),
  color('inkLight', '浅色页面 · 文字与图标'), color('inkDark', '深色页面 · 文字与图标'),
  number('cornerRadius', '圆角', 0, 80, 1, 'px'), number('paddingPx', '内边距', 0, 30, 1, 'px'),
  number('shadowOpacity', '投影不透明度', 0, 0.6, 0.01), number('shadowBlur', '投影柔化', 0, 40, 1, 'px'),
  number('shadowY', '投影偏移', 0, 12, 1, 'px'), color('shadowColor', '投影颜色'),
  number('elasticity', '指针弹性', 0, 0.3, 0.01), { key: 'overLight', label: '附加压暗层', type: 'boolean' },
];
const lensFields: GlassField[] = [
  number('refraction', '折射强度', 0, 0.08, 0.001), number('frost', '磨砂', 0, 0.3, 0.005),
  number('aberration', '色散', 0, 0.1, 0.001), number('bevelDepth', '边缘深度', 0, 0.1, 0.001),
  number('bevelWidth', '边缘宽度', 0.005, 0.2, 0.005), number('magnify', '放大倍率', 1, 1.3, 0.005),
  number('tintOpacity', '染色不透明度', 0, 0.5, 0.005), color('tintColor', '染色'),
  number('interactionStrength', '流体交互强度', 0, 0.6, 0.01), number('interactionRadius', '交互半径', 0.2, 3, 0.05),
  number('interactionViscosity', '黏滞度', 0.05, 0.9, 0.01),
  { key: 'shadow', label: '投影', type: 'boolean' }, { key: 'specular', label: '镜面高光', type: 'boolean' },
];
const scrollbarFields: GlassField[] = [
  number('width', '可见宽度', 3, 12, 1, 'px'), number('blurPx', '模糊', 0, 15, 0.1, 'px'),
  number('saturation', '饱和度', 0, 200, 1, '%'), number('displacementScale', '折射', 0, 12, 0.5),
  color('fillColor', '底色'), number('fillOpacity', '底色不透明度', 0, 1, 0.01),
  number('shadowOpacity', '阴影不透明度', 0, 0.6, 0.01), number('idleDelay', '停止滚动后等待', 300, 3000, 50, 'ms'),
  number('fadeMs', '淡出时间', 100, 1000, 50, 'ms'),
];
export function fieldsFor(type: GlassType): GlassField[] {
  const kind = glassTypes[type].kind;
  if (kind === 'lens') return lensFields;
  if (kind === 'scrollbar') return scrollbarFields;
  // Header geometry stays linked to its existing single-row responsive sizing.
  return type === 'navigation' || type === 'toggle'
    ? surfaceFields.filter(f => !['cornerRadius', 'paddingPx', 'elasticity'].includes(f.key)) : surfaceFields;
}
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
}
export function validateProfiles(value: unknown): asserts value is GlassProfiles {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数格式无效');
  const profiles = value as GlassProfiles;
  if (Object.keys(profiles).length !== Object.keys(glassTypes).length) throw new Error('组件类型不完整');
  for (const type of Object.keys(glassTypes) as GlassType[]) {
    const profile = profiles[type];
    const fields = glassTypes[type].kind === 'surface' ? surfaceFields : fieldsFor(type);
    if (!profile || typeof profile !== 'object' || Object.keys(profile).length !== fields.length) throw new Error(`参数不完整：${type}`);
    for (const field of fields) {
      const v = profile[field.key];
      const valid = field.type === 'number' ? typeof v === 'number' && Number.isFinite(v) && v >= field.min! && v <= field.max!
        : field.type === 'boolean' ? typeof v === 'boolean'
        : field.type === 'color' ? typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v)
        : typeof v === 'string' && field.options!.includes(v);
      if (!valid) throw new Error(`参数无效：${type}.${field.key}`);
    }
  }
}
