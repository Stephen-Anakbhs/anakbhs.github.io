import { useId, useRef, useState, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";
import { getScene, nextScene, preloadScene, setScene, useScene, type Scene } from "../../content/scenes";
import { GlassSurface } from "../ui/GlassSurface";
import { fullGlass } from "../ui/glassQuality";
import { lensMap } from "../ui/lensMap";
import { tooltipShift } from "../ui/tooltipPlacement";

// A standalone glass control at the leading edge of the bar, apart from the navigation group. Each press
// flips light/dark and draws a new scene (wallpaper, heading glass tint and font); the icon shows the mode.
export function SceneButton({ tone }: { tone: "light" | "dark" }) {
  const scene = useScene();
  const upcoming = useRef<Scene | null>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const filterId = `scene-lens-${useId().replace(/:/g, "")}`;
  const [lens, setLens] = useState<{ width: number; height: number; map: string } | null>(null);

  // Pick and fetch the next scene ahead of the click, so the swap is a crossfade rather than a load;
  // centre the label under the control, or align it with the control's edge when it can't be centred.
  const prepare = () => {
    upcoming.current ??= nextScene(getScene());
    void preloadScene(upcoming.current);
    const element = tooltip.current;
    if (!element?.parentElement) return;
    const anchor = element.parentElement.getBoundingClientRect();
    const width = element.offsetWidth, height = element.offsetHeight;
    element.style.setProperty("--tooltip-shift", `${tooltipShift(anchor, width)}px`);
    if (fullGlass && (lens?.width !== width || lens.height !== height)) setLens({ width, height, map: lensMap(width, height, height / 2) });
  };

  const randomize = () => {
    const target = upcoming.current ?? nextScene(getScene());
    upcoming.current = null;
    void preloadScene(target).then(() => setScene(target));
  };

  const dark = scene.mode === "dark";
  return (
    <span className="icon-control scene-control" onPointerEnter={prepare} onFocus={prepare}>
      <GlassSurface material="navigation" glassType="toggle" className="scene-toggle" tone={tone}>
        <button className="glass-action glass-icon" type="button" onClick={randomize}
          aria-label={`Domain randomization: switch background and theme (now ${scene.name}, ${scene.mode})`}>
          <span className="scene-glyph" data-mode={scene.mode} aria-hidden="true">
            <Sun className="scene-glyph-sun" size={22} strokeWidth={1.7} />
            <Moon className="scene-glyph-moon" size={20} strokeWidth={1.7} />
          </span>
        </button>
      </GlassSurface>
      <span ref={tooltip} className="icon-tooltip scene-tooltip" aria-hidden="true"
        style={lens ? { "--tooltip-lens": `url(#${filterId})` } as CSSProperties : undefined}>
        {lens && <svg aria-hidden="true" focusable="false">
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feImage href={lens.map} x={0} y={0} width={lens.width} height={lens.height} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={16} xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </svg>}
        Click for domain randomization
        <small>{scene.name} · {dark ? "dark" : "light"}</small>
      </span>
    </span>
  );
}
