import { useCallback, useEffect, useRef, type ComponentProps, type CSSProperties, type HTMLAttributes, type PropsWithChildren, type RefObject } from "react";
import LiquidGlass from "liquid-glass-react";
import { type GlassAppearance, type GlassMaterial, type GlassTone } from "../../content/appearance";
import { observeGlassVisibility } from "./glassVisibility";
import { lensMap } from "./lensMap";
import { surfaceAppearance, useGlassProfile } from '../../content/glassStore';
import type { GlassType } from '../../content/glassSchema';

// Supplying both positions disables the library's per-mousemove state updates.
const staticPointer = { x: 0, y: 0 };
const pressableTypes: ReadonlySet<GlassType> = new Set(["control", "social"]);
type PointerOptions = Pick<ComponentProps<typeof LiquidGlass>, "mouseContainer" | "globalMousePos" | "mouseOffset">;
export type GlassSurfaceProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & Partial<GlassAppearance> & PointerOptions & {
    material?: GlassMaterial;
    tone?: GlassTone;
    enabled?: boolean;
    glassType?: GlassType;
  }
>;

// Hover makes the glass behave like a liquid lens without React renders: the rim
// light turns toward the pointer and the bezel refraction swells, then relaxes.
function useLiquidHover(surface: RefObject<HTMLDivElement | null>, active: boolean, lensScale: number) {
  useEffect(() => {
    const element = surface.current;
    if (!element || !active || !matchMedia("(hover: hover)").matches) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let swellFrame = 0;
    let swell = 0;
    let pointerX = 0;
    let pointerY = 0;
    let angle = -45;
    const apply = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const x = (pointerX - rect.left) / rect.width;
      const y = (pointerY - rect.top) / rect.height;
      // Unwrap so the registered angle never animates the long way round.
      const target = Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI + 90;
      angle += ((target - angle) % 360 + 540) % 360 - 180;
      element.style.setProperty("--glass-pointer-x", `${(x * 100).toFixed(1)}%`);
      element.style.setProperty("--glass-pointer-y", `${(y * 100).toFixed(1)}%`);
      element.style.setProperty("--glass-light-angle", `${angle.toFixed(1)}deg`);
    };
    const swellTo = (target: number) => {
      cancelAnimationFrame(swellFrame);
      const displacement = element.querySelector("feDisplacementMap");
      if (!displacement || !lensScale || still) return;
      const from = swell;
      const start = performance.now();
      const duration = target ? 280 : 380;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        swell = from + (target - from) * (1 - (1 - t) ** 3);
        displacement.setAttribute("scale", (lensScale * (1 + 0.8 * swell)).toFixed(2));
        if (t < 1) swellFrame = requestAnimationFrame(step);
      };
      swellFrame = requestAnimationFrame(step);
    };
    const track = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const enter = (event: PointerEvent) => {
      track(event);
      if (event.pointerType !== "touch") swellTo(1);
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      angle = -45;
      element.style.removeProperty("--glass-light-angle");
      swellTo(0);
    };
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointermove", track);
    element.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(swellFrame);
      element.style.removeProperty("--glass-light-angle");
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointermove", track);
      element.removeEventListener("pointerleave", leave);
    };
  }, [surface, active, lensScale]);
}

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
  const lens = enabled && appearance.mode === "lens";
  const radius = appearance.cornerRadius;
  const lensDisplacement = useCallback((width: number, height: number) => lensMap(width, height, radius), [radius]);
  const pressable = enabled && pressableTypes.has(componentType);
  useLiquidHover(surface, pressable, lens ? appearance.displacementScale : 0);
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
      data-material={material} data-glass-type={componentType} data-glass-enabled={enabled} data-glass-over-light={appearance.overLight}
      data-glass-optics={lens ? "lens" : undefined} data-glass-pressable={pressable || undefined} style={variables}>
      {enabled ? <LiquidGlass
        blurAmount={Math.max(0, (appearance.blurPx - (appearance.overLight ? 12 : 4)) / 32)}
        saturation={appearance.saturation}
        cornerRadius={appearance.cornerRadius}
        displacementScale={appearance.displacementScale}
        aberrationIntensity={appearance.aberrationIntensity}
        elasticity={appearance.elasticity}
        mode={lens ? "standard" : appearance.mode as Exclude<GlassAppearance["mode"], "lens">}
        displacementMap={lens ? lensDisplacement : undefined}
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
