import type { FeatureItem } from "../../content/site";

type FeatureGridProps = {
  items: FeatureItem[];
};

export function FeatureGrid({ items }: FeatureGridProps) {
  return (
    <div className="feature-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article className="feature-tile" key={item.title}>
            <div className="tile-meta">
              <span>{item.label}</span>
              <Icon size={18} />
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        );
      })}
    </div>
  );
}
