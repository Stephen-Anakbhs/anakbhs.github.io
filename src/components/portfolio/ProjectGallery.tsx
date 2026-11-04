import { memo, useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { ShowcaseItem } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { boxOf, closeMotion, currentTransform, flip, openMotion, reducedMotion, useMorphDialog, type Box } from "../ui/glassMorph";
import { fullGlass } from "../ui/glassQuality";
import { lensMap } from "../ui/lensMap";
import { preparePreview } from "../ui/ImageLightbox";
import { InlineText } from "../ui/InlineText";
import { TransparentVideo } from "../ui/TransparentVideo";
import "../../styles/glass-dialog.css";

type Selection = { project: ShowcaseItem; origin: HTMLElement | null };

// Projects: three large cards. Portfolio: four smaller cards in the Honors grid, same card and detail sheet.
const variants = {
  projects: {
    grid: "showcase-grid", label: "Selected projects", open: "Open project", close: "Close project", track: "project",
    sizes: "(max-width: 640px) calc(100vw - 40px), (max-width: 740px) min(480px, calc(100vw - 48px)), (max-width: 920px) calc((100vw - 96px) / 3), min(358px, calc((100vw - 136px) / 3))",
  },
  portfolio: {
    grid: "portfolio-grid", label: "Portfolio", open: "Open", close: "Close", track: "portfolio",
    sizes: "(max-width: 860px) calc((100vw - 52px) / 2), min(270px, calc((100vw - 196px) / 4))",
  },
};
type Variant = (typeof variants)[keyof typeof variants];

// Memoised so opening or closing the dialog does not re-render every glass card.
// The whole card opens the project; the button inside is what keyboards and screen readers reach.
const ProjectCard = memo(function ProjectCard({ item, variant, paused, onOpen }: { item: ShowcaseItem; variant: Variant; paused: boolean; onOpen: (item: ShowcaseItem, origin: HTMLElement | null) => void }) {
  const prepare = () => { if (!item.film) void preparePreview(item.detailSources?.src ?? item.detailImage); };
  return (
    <article className="showcase-card" data-track-item={`${variant.track}:${item.id}`} onClick={(event) => onOpen(item, event.currentTarget)}>
      <GlassSurface material="media" className="showcase-media" padding="0px">
        <button
          className="showcase-image"
          type="button"
          onPointerEnter={prepare}
          onFocus={prepare}
          onPointerDown={prepare}
          aria-label={`${variant.open}: ${item.title}`}
          aria-haspopup="dialog"
          data-fit={item.imageFit || "cover"}
        >
          {item.film
            ? <TransparentVideo className="showcase-film" src={item.film.card} poster={item.film.poster} alt={item.title} active={!paused} />
            : <img src={item.imageSources?.src ?? item.image} srcSet={item.imageSources?.srcSet} sizes={variant.sizes}
                alt={item.title} loading="lazy" decoding="async" />}
        </button>
      </GlassSurface>
      <div className="showcase-caption">
        <span className="showcase-title">{item.title}</span>
        <ArrowUpRight className="showcase-arrow" size={20} aria-hidden="true" />
        <span className="showcase-summary">{item.summary}</span>
      </div>
    </article>
  );
});

export function ProjectGallery({ items, kind = "projects" }: { items: ShowcaseItem[]; kind?: keyof typeof variants }) {
  const variant = variants[kind];
  const [selection, setSelection] = useState<Selection | null>(null);
  const openProject = useCallback((project: ShowcaseItem, origin: HTMLElement | null) => setSelection({ project, origin }), []);
  const { dialogRef, state, show, run, close, handleClose } = useMorphDialog(() => setSelection(null));
  const veilRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const mapRef = useRef<SVGFEImageElement>(null);
  const filterId = `project-lens-${useId().replace(/:/g, "")}`;
  const project = selection?.project;

  const sourceBox = (origin: HTMLElement | null | undefined): Box | null => {
    if (!origin?.isConnected) return null;
    const box = boxOf(origin);
    return box.width > 0 && box.y + box.height > 0 && box.y < innerHeight ? box : null;
  };
  const near = (box: Box): Box => ({ x: box.x + box.width * 0.04, y: box.y + box.height * 0.04, width: box.width * 0.92, height: box.height * 0.92 });

  useLayoutEffect(() => {
    if (!selection) return;
    let cancelled = false;
    let mapTimer: number | undefined;
    const cleanup = () => { cancelled = true; clearTimeout(mapTimer); };
    show(selection.origin);
    const sheet = sheetRef.current!;
    const target = boxOf(sheet);
    if (fullGlass) mapTimer = window.setTimeout(() => {
      mapRef.current?.setAttribute("width", String(target.width));
      mapRef.current?.setAttribute("height", String(target.height));
      mapRef.current?.setAttribute("href", lensMap(target.width, target.height, 28, 24));
    });
    const dialog = dialogRef.current!;
    if (reducedMotion()) { dialog.dataset.settled = ""; return cleanup; }
    const { easing, duration } = openMotion;
    const from = sourceBox(selection.origin) ?? near(target);
    void run([
      veilRef.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }),
      sheet.animate([{ transform: flip(from, target) }, { transform: "none" }], { duration, easing }),
      contentRef.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: duration * 0.4, easing: "ease-out", fill: "backwards" }),
    ]).then(completed => { if (completed && !cancelled && !state.current.closing) dialog.dataset.settled = ""; });
    return cleanup;
  }, [selection]);

  const requestClose = () => {
    const sheet = sheetRef.current;
    const dialog = dialogRef.current;
    if (!sheet || !dialog) { void close(); return; }
    delete dialog.dataset.settled;
    void close(() => {
      const home = boxOf(sheet);
      const { easing, duration } = closeMotion;
      const to = sourceBox(state.current.origin) ?? near(home);
      const transform = currentTransform(sheet);
      return [
        veilRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.8, easing: "ease-in", fill: "forwards" }),
        sheet.animate([{ transform }, { transform: flip(to, home) }], { duration, easing, fill: "forwards" }),
        contentRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in", fill: "forwards" }),
      ];
    });
  };

  return (
    <>
      <div className={variant.grid} aria-label={variant.label}>
        {items.map((item) => <ProjectCard key={item.id} item={item} variant={variant} paused={Boolean(item.film && selection)} onOpen={openProject} />)}
      </div>
      <dialog className="glass-dialog project-dialog" ref={dialogRef} data-liquid-ignore=""
        aria-labelledby={project ? `${variant.track}-${project.id}-title` : undefined}
        onClose={handleClose}
        onCancel={(event) => { event.preventDefault(); requestClose(); }}>
        {project && <>
          <div className="glass-veil" ref={veilRef} onClick={requestClose} />
          <div className="glass-sheet project-sheet" ref={sheetRef}
            style={fullGlass ? { "--sheet-lens": `url(#${filterId})` } as CSSProperties : undefined}>
            {fullGlass && <svg className="glass-defs" aria-hidden="true" focusable="false">
              <filter id={filterId} colorInterpolationFilters="sRGB">
                <feImage ref={mapRef} x={0} y={0} width={1} height={1} preserveAspectRatio="none" result="map" />
                <feDisplacementMap in="SourceGraphic" in2="map" scale={48} xChannelSelector="R" yChannelSelector="B" />
              </filter>
            </svg>}
            <span className="glass-sheet-optics" aria-hidden="true" />
            <span className="glass-sheet-tint" aria-hidden="true" />
            <article className="project-detail" ref={contentRef}>
              {project.film
                ? <div className="project-detail-media" data-kind="film">
                    {/* Phones already hold the card's file, sharp enough at their width. */}
                    <TransparentVideo className="project-film" src={matchMedia("(max-width: 640px)").matches ? project.film.card : project.film.detail}
                      poster={project.film.poster} alt={project.title} />
                  </div>
                : <div className="project-detail-media" data-kind="image">
                    <img className="project-detail-image" src={project.detailSources?.src ?? project.detailImage}
                      srcSet={project.detailSources?.srcSet} width={project.detailSources?.width} height={project.detailSources?.height}
                      alt={project.title} />
                  </div>}
              <header className="project-detail-heading">
                <h2 id={`${variant.track}-${project.id}-title`}>{project.title}</h2>
                <button className="glass-close project-close" type="button" onClick={requestClose} aria-label={variant.close} title={variant.close} autoFocus>
                  <X size={22} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </header>
              {project.points
                ? <>
                    <p className="project-detail-lead">{project.summary}</p>
                    <ul className="project-detail-points">
                      {project.points.map((point, index) => <li key={index}><InlineText parts={point} /></li>)}
                    </ul>
                  </>
                : <p>{project.body}</p>}
              {project.video && <div className="video-frame">
                <iframe src={project.video} title={`${project.title} video`} loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
              </div>}
              {project.href && <a className="text-link" href={project.href} target="_blank" rel="noopener noreferrer">
                Watch on YouTube <ArrowUpRight size={17} aria-hidden="true" />
              </a>}
            </article>
          </div>
        </>}
      </dialog>
    </>
  );
}
