import type { CareerEntry } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";

export function CareerList({ items }: { items: CareerEntry[] }) {
  return (
    <div className="career-list">
      {items.map((item) => (
        <article className="career-entry" key={item.institution}>
          <GlassSurface material="logo" className="career-logo-glass">
          <a className="career-logo" href={item.groupHref || item.href} target="_blank" rel="noopener noreferrer" aria-label={item.group || item.institution}>
            <img src={item.logo} alt={`${item.institution} logo`} loading="lazy" />
          </a>
          </GlassSurface>
          <div className="career-copy">
            <div className="career-heading">
              <h3><a href={item.href} target="_blank" rel="noopener noreferrer">{item.institution}</a></h3>
              <span className="career-date">{item.period}</span>
            </div>
            <p className="career-role">{item.role}</p>
            <p className="career-group">{item.groupHref
              ? <a href={item.groupHref} target="_blank" rel="noopener noreferrer">{item.group}</a>
              : item.group}</p>
            {item.mentors && <p className="career-mentors">Advised by {item.mentors.map((mentor, index) => (
              <span key={mentor.name}>{index > 0 && " and "}{mentor.href
                ? <a href={mentor.href} target="_blank" rel="noopener noreferrer">{mentor.name}</a>
                : mentor.name}</span>
            ))}</p>}
            {item.description && <p className="career-description">{item.description}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}
