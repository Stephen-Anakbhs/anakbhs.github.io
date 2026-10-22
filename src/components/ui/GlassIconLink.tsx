import { useId, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { GlassSurface } from "./GlassSurface";
import { fullGlass } from "./glassQuality";
import { lensMap } from "./lensMap";
import { tooltipShift } from "./tooltipPlacement";

type GlassIconLinkProps = {
  href: string;
  label: string;
  icon: LucideIcon | string;
  tone?: "light" | "dark";
  brand?: string;
};

export function GlassIconLink({ href, label, icon: Icon, tone = "light", brand }: GlassIconLinkProps) {
  const tooltip = useRef<HTMLSpanElement>(null);
  const filterId = `tooltip-lens-${useId().replace(/:/g, "")}`;
  const [lens, setLens] = useState<{ width: number; height: number; map: string } | null>(null);

  // Centre the label under its icon (or align it with the icon's edge near the screen edge) and size its lens once.
  const prepareTooltip = () => {
    const element = tooltip.current;
    if (!element?.parentElement) return;
    const anchor = element.parentElement.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    element.style.setProperty("--tooltip-shift", `${tooltipShift(anchor, width)}px`);
    if (fullGlass && (lens?.width !== width || lens.height !== height)) setLens({ width, height, map: lensMap(width, height, height / 2) });
  };

  return (
    <span className="icon-control" data-brand={brand} onPointerEnter={prepareTooltip} onFocus={prepareTooltip}>
      <GlassSurface className="social-glass" tone={tone} glassType="social">
        <a className="glass-action glass-icon" href={href} aria-label={label}
          {...(href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
          {typeof Icon === "string"
            ? <span className="brand-icon" style={{ maskImage: `url("${Icon}")` }} aria-hidden="true">
                <img className="brand-icon-flat" src={Icon} alt="" />
              </span>
            : <Icon size={21} strokeWidth={1.8} aria-hidden="true" />}
        </a>
      </GlassSurface>
      <span ref={tooltip} className="icon-tooltip" aria-hidden="true"
        style={lens ? { "--tooltip-lens": `url(#${filterId})` } as CSSProperties : undefined}>
        {lens && <svg aria-hidden="true" focusable="false">
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feImage href={lens.map} x={0} y={0} width={lens.width} height={lens.height} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={16} xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </svg>}
        {label}
      </span>
    </span>
  );
}
