import { useId, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { GlassSurface } from "./GlassSurface";
import { lensMap } from "./lensMap";

type GlassIconLinkProps = {
  href: string;
  label: string;
  icon: LucideIcon | string;
  tone?: "light" | "dark";
};

const viewportMargin = 8;

export function GlassIconLink({ href, label, icon: Icon, tone = "light" }: GlassIconLinkProps) {
  const tooltip = useRef<HTMLSpanElement>(null);
  const filterId = `tooltip-lens-${useId().replace(/:/g, "")}`;
  const [lens, setLens] = useState<{ width: number; height: number; map: string } | null>(null);

  // Centre the label under its icon, nudge it back inside the viewport, and size its lens once.
  const prepareTooltip = () => {
    const element = tooltip.current;
    if (!element?.parentElement) return;
    const anchor = element.parentElement.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left = anchor.left + anchor.width / 2 - width / 2;
    const overflowLeft = viewportMargin - left;
    const overflowRight = left + width - (document.documentElement.clientWidth - viewportMargin);
    element.style.setProperty("--tooltip-shift", `${Math.max(0, overflowLeft) - Math.max(0, overflowRight)}px`);
    if (lens?.width !== width || lens.height !== height) setLens({ width, height, map: lensMap(width, height, height / 2) });
  };

  return (
    <span className="icon-control" onPointerEnter={prepareTooltip} onFocus={prepareTooltip}>
      <GlassSurface className="social-glass" tone={tone} glassType="social">
        <a className="glass-action glass-icon" href={href} aria-label={label}
          {...(href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
          {typeof Icon === "string"
            ? <span className="brand-icon" style={{ maskImage: `url("${Icon}")` }} aria-hidden="true" />
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
