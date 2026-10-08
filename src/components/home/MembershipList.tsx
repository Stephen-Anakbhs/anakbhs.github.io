import { ArrowUpRight } from "lucide-react";
import type { Membership } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";

export function MembershipList({ items }: { items: Membership[] }) {
  return (
    <div className="membership-list">
      {items.map((item) => (
        <article className={`membership-entry${item.logo ? " has-logo" : ""}`} key={item.title}>
          {item.logo && <GlassSurface material="logo" className="membership-logo-glass"><img className="membership-logo" src={item.logoSources?.src ?? item.logo} srcSet={item.logoSources?.srcSet} alt={`${item.title} logo`} loading="lazy" decoding="async" /></GlassSurface>}
          <div>
            <div className="membership-heading">
              <h3>{item.title}</h3>
              <span className="career-date">{item.period}</span>
            </div>
            <p className="membership-subtitle">{item.subtitle}</p>
            <p>{item.body}</p>
            <div className="membership-links">
              {item.links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}<ArrowUpRight size={14} aria-hidden="true" />
              </a>)}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
