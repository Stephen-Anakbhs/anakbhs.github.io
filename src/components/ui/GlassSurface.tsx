import { useEffect, useRef, type ComponentProps, type CSSProperties, type HTMLAttributes, type PropsWithChildren } from "react";
import LiquidGlass from "liquid-glass-react";
import { type GlassAppearance, type GlassMaterial, type GlassTone } from "../../content/appearance";
import { observeGlassVisibility } from "./glassVisibility";
import { surfaceAppearance, useGlassProfile } from '../../content/glassStore';
import type { GlassType } from '../../content/glassSchema';

// Supplying both positions disables the library's per-mousemove state updates.
const staticPointer = { x: 0, y: 0 };
type PointerOptions = Pick<ComponentProps<typeof LiquidGlass>, "mouseContainer" | "globalMousePos" | "mouseOffset">;
export type GlassSurfaceProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & Partial<GlassAppearance> & PointerOptions & {
    material?: GlassMaterial;
    tone?: GlassTone;
    enabled?: boolean;
    glassType?: GlassType;
  }
>;

export function GlassSurface({
  children, className = "", style, material = "control", tone = "dark", enabled = true, glassType,
  blurPx, saturation, displacementScale, aberrationIntensity, elasticity, cornerRadius, mode, overLight,
  fill, ink, hoverFill, highlightOpacity, shadow, padding, mouseContainer, globalMousePos, mouseOffset,
  ...attributes
}: GlassSurfaceProps) {
  const surface = useRef<HTMLDivElement>(null);
  const componentType = glassType ?? material;
  useGlassProfile(componentType);
  const appearance = surfaceAppearance(componentType, tone);
  const explicit = { blurPx, saturation, displacementScale, aberrationIntensity, elasticity, cornerRadius, mode, overLight, fill, ink, hoverFill, highlightOpacity, shadow, padding };
  Object.assign(appearance, Object.fromEntries(Object.entries(explicit).filter(([, v]) => v !== undefined)));
  useEffect(() => {
    if (surface.current && enabled) return observeGlassVisibility(surface.current);
  }, [enabled]);
  const trackPointer = appearance.elasticity > 0 || mouseContainer != null;
  const variables = {
    "--glass-blur": `${appearance.blurPx}px`, "--glass-saturation": `${appearance.saturation}%`,
    "--glass-ink": appearance.ink, "--glass-fill": appearance.fill, "--glass-hover": appearance.hoverFill,
    "--glass-highlight-opacity": appearance.highlightOpacity, "--glass-shadow": appearance.shadow,
    "--glass-radius": `${appearance.cornerRadius}px`, "--glass-padding": appearance.padding,
    borderRadius: appearance.cornerRadius,
    ...style,
  } as CSSProperties;
  return (
    <div {...attributes} ref={surface} className={`liquid-surface ${className}`} data-tone={tone}
      data-material={material} data-glass-type={componentType} data-glass-enabled={enabled} data-glass-over-light={appearance.overLight} style={variables}>
      {enabled ? <LiquidGlass
        blurAmount={Math.max(0, (appearance.blurPx - (appearance.overLight ? 12 : 4)) / 32)}
        saturation={appearance.saturation}
        cornerRadius={appearance.cornerRadius}
        displacementScale={appearance.displacementScale}
        aberrationIntensity={appearance.aberrationIntensity}
        elasticity={appearance.elasticity}
        mode={appearance.mode}
        overLight={appearance.overLight}
        mouseContainer={mouseContainer}
        globalMousePos={globalMousePos ?? (trackPointer ? undefined : staticPointer)}
        mouseOffset={mouseOffset ?? (trackPointer ? undefined : staticPointer)}
        className="liquid-engine"
        padding={appearance.padding}
        style={{ position: "relative", top: "auto", left: "auto" }}
      >{children}</LiquidGlass> : <div className="glass-plain-content">{children}</div>}
    </div>
  );
}
