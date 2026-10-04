import type { LucideIcon } from "lucide-react";
import { GlassSurface } from "./GlassSurface";

type GlassIconLinkProps = {
  href: string;
  label: string;
  icon: LucideIcon | string;
  tone?: "light" | "dark";
};

export function GlassIconLink({ href, label, icon: Icon, tone = "light" }: GlassIconLinkProps) {
  return (
    <span className="icon-control">
      <GlassSurface className="social-glass" tone={tone} glassType="social">
        <a className="glass-action glass-icon" href={href} aria-label={label}
          {...(href.startsWith("mailto:") ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
          {typeof Icon === "string"
            ? <span className="brand-icon" style={{ maskImage: `url("${Icon}")` }} aria-hidden="true" />
            : <Icon size={21} strokeWidth={1.8} aria-hidden="true" />}
        </a>
      </GlassSurface>
      <span className="icon-tooltip" aria-hidden="true">{label}</span>
    </span>
  );
}
