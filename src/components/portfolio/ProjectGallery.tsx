import { memo, useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { ShowcaseItem } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { boxOf, closeMotion, currentTransform, flip, openMotion, reducedMotion, useMorphDialog, type Box } from "../ui/glassMorph";
import { fullGlass } from "../ui/glassQuality";
import { lensMap } from "../ui/lensMap";
import { preparePreview } from "../ui/ImageLightbox";
import "../../styles/glass-dialog.css";

type Selection = { project: ShowcaseItem; origin: HTMLElement | null };

// Memoised so opening or closing the dialog does not re-render every glass card.
const ProjectCard = memo(function ProjectCard({ item, onOpen }: { item: ShowcaseItem; onOpen: (item: ShowcaseItem, origin: HTMLElement | null) => void }) {
  const prepare = () => { void preparePreview(item.detailSources?.src ?? item.detailImage); };
  return (
    <article className="showcase-card">
      <button
        className="showcase-image"
        type="button"
        onPointerEnter={prepare}
        onFocus={prepare}
        onPointerDown={prepare}
        onClick={(event) => onOpen(item, event.currentTarget.closest<HTMLElement>(".showcase-card"))}
        aria-label={`Open project: ${item.title}`}
        aria-haspopup="dialog"
        data-fit={item.imageFit || "cover"}
      >
        <img src={item.imageSources?.src ?? item.image} srcSet={item.imageSources?.srcSet}
          sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 740px) min(480px, calc(100vw - 48px)), (max-width: 920px) calc((100vw - 96px) / 3), min(358px, calc((100vw - 136px) / 3))"
          alt={item.title} loading="lazy" decoding="async" />
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
  );
});

export function ProjectGallery({ items }: { items: ShowcaseItem[] }) {
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
    show(selection.origin);
    const sheet = sheetRef.current!;
    const dialog = dialogRef.current!;
    const picture = contentRef.current?.querySelector<HTMLImageElement>(".project-detail-image");
    const target = boxOf(sheet);
    let mapped: Box | undefined;
    const active = () => !cancelled && dialog.open && !state.current.closing;
    const syncMap = (bounds: Box) => {
      const map = mapRef.current;
      if (!fullGlass || !active() || !map || (mapped?.width === bounds.width && mapped.height === bounds.height)) return;
      map.setAttribute("width", String(bounds.width));
      map.setAttribute("height", String(bounds.height));
      map.setAttribute("href", lensMap(bounds.width, bounds.height, 28, 24));
      mapped = bounds;
    };
    const onImageLoad = () => {
      if (active() && dialog.dataset.settled !== undefined) syncMap(boxOf(sheet));
    };
    const cleanup = () => {
      cancelled = true;
      clearTimeout(mapTimer);
      picture?.removeEventListener("load", onImageLoad);
    };
    const markSettled = () => {
      if (!active()) return;
      clearTimeout(mapTimer);
      // The image may have established its height after the opening box was measured.
      if (fullGlass) syncMap(boxOf(sheet));
      dialog.dataset.settled = "";
    };
    if (fullGlass) {
      mapTimer = window.setTimeout(() => syncMap(target));
      picture?.addEventListener("load", onImageLoad);
    }
    if (reducedMotion()) { markSettled(); return cleanup; }
    const { easing, duration } = openMotion;
    const from = sourceBox(selection.origin) ?? near(target);
    void run([
      veilRef.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }),
      sheet.animate([{ transform: flip(from, target) }, { transform: "none" }], { duration, easing }),
      contentRef.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: duration * 0.4, easing: "ease-out", fill: "backwards" }),
    ]).then(completed => { if (completed) markSettled(); });
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
      <div className="showcase-grid" aria-label="Selected projects">
        {items.map((item) => <ProjectCard key={item.id} item={item} onOpen={openProject} />)}
      </div>
      <dialog className="glass-dialog project-dialog" ref={dialogRef} data-liquid-ignore=""
        aria-labelledby={project ? `project-${project.id}-title` : undefined}
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
              <header className="project-detail-heading">
                <h2 id={`project-${project.id}-title`}>{project.title}</h2>
                <button className="glass-close project-close" type="button" onClick={requestClose} aria-label="Close project" title="Close project" autoFocus>
                  <X size={22} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </header>
              <p>{project.body}</p>
              <img className="project-detail-image" src={project.detailSources?.src ?? project.detailImage}
                srcSet={project.detailSources?.srcSet} width={project.detailSources?.width} height={project.detailSources?.height}
                style={{ height: "auto" }} alt={project.title} />
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
