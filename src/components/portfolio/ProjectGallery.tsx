import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { ShowcaseItem } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";

export function ProjectGallery({ items }: { items: ShowcaseItem[] }) {
  const [project, setProject] = useState<ShowcaseItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (project && !dialog.open) dialog.showModal();
    if (!project && dialog.open) dialog.close();
  }, [project]);

  return (
    <>
      <div className="showcase-grid" aria-label="Selected projects">
        {items.map((item) => (
          <article className="showcase-card" key={item.id}>
            <button
              className="showcase-image"
              type="button"
              onClick={() => setProject(item)}
              aria-label={`Open project: ${item.title}`}
              aria-haspopup="dialog"
              data-fit={item.imageFit || "cover"}
            >
              <img src={item.image} alt={item.title} loading="lazy" decoding="async" />
            </button>
            <div className="showcase-overlay" aria-hidden="true">
              <GlassSurface material="overlay" className="showcase-glass" tone={item.id === "lego-bus" ? "dark" : "light"}>
                <span className="showcase-overlay-content">
                  <span className="showcase-title">{item.title}</span>
                  <span className="showcase-summary">{item.summary}</span>
                  <ArrowUpRight size={22} />
                </span>
              </GlassSurface>
            </div>
          </article>
        ))}
      </div>
      <dialog className="project-dialog" ref={dialogRef}
        aria-labelledby={project ? `project-${project.id}-title` : undefined}
        onClose={() => setProject(null)}
        onCancel={(event) => { event.preventDefault(); setProject(null); }}
        onClick={(event) => { if (event.target === event.currentTarget) setProject(null); }}>
        {project && <article className="project-detail">
          <header className="project-detail-heading">
            <h2 id={`project-${project.id}-title`}>{project.title}</h2>
            <button className="project-close" type="button" onClick={() => setProject(null)} aria-label="Close project" title="Close project" autoFocus>
              <X size={24} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </header>
          <p>{project.body}</p>
          <img className="project-detail-image" src={project.detailImage} alt={project.title} />
          {project.video && <div className="video-frame">
            <iframe src={project.video} title={`${project.title} video`} loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          </div>}
          {project.href && <a className="text-link" href={project.href} target="_blank" rel="noopener noreferrer">
            Watch on YouTube <ArrowUpRight size={17} aria-hidden="true" />
          </a>}
        </article>}
      </dialog>
    </>
  );
}
