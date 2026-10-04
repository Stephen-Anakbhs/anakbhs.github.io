import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import { boxOf, closeMotion, containBox, currentTransform, flip, openMotion, reducedMotion, useMorphDialog, type Box } from "./glassMorph";
import { fullGlass } from "./glassQuality";
import { lensMap } from "./lensMap";
import "../../styles/glass-dialog.css";

export type PreviewImage = { src: string; alt: string; origin?: HTMLElement | null };

type Layout = { sheet: Box; card: Box; caption: Box; close: Box; radius: number };

// Final geometry, computed once per open (and on resize); the morph only uses transforms.
function finalLayout(natural: { width: number; height: number }, caption: HTMLElement, closeSize: number): Layout {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const compact = viewportWidth < 640;
  const margin = compact ? 12 : 36;
  const pad = compact ? 10 : 16;
  const gap = compact ? 10 : 14;
  const radius = compact ? 24 : 32;
  const maxWidth = Math.min(viewportWidth - 2 * margin, 1360) - 2 * pad;
  const maxHeight = viewportHeight - 2 * margin - 2 * pad - gap;
  const captionHeight = (width: number) => { caption.style.width = `${width}px`; return caption.offsetHeight; };
  let width = maxWidth;
  let height = 0;
  let text = 0;
  // The caption wraps to the figure width, so settle the two together.
  for (let pass = 0; pass < 3; pass++) {
    text = captionHeight(width);
    const scale = Math.min(maxWidth / natural.width, Math.max(48, maxHeight - text) / natural.height, 2);
    width = natural.width * scale;
    height = natural.height * scale;
  }
  text = captionHeight(width);
  const sheetWidth = width + 2 * pad;
  const sheetHeight = pad + height + gap + text + pad;
  const sheet = { x: (viewportWidth - sheetWidth) / 2, y: Math.max(margin, (viewportHeight - sheetHeight) / 2), width: sheetWidth, height: sheetHeight };
  const card = { x: sheet.x + pad, y: sheet.y + pad, width, height };
  // Small screens float the close button above the sheet so it never covers a short figure.
  const above = compact && sheet.y >= closeSize + 16;
  const close = above
    ? { x: sheet.x + sheet.width - closeSize, y: sheet.y - closeSize - 10, width: closeSize, height: closeSize }
    : { x: card.x + card.width - closeSize - 10, y: card.y + 10, width: closeSize, height: closeSize };
  return { sheet, card, caption: { x: card.x, y: card.y + height + gap, width, height: text }, close, radius };
}

const place = (element: HTMLElement, box: Box) => {
  element.style.left = `${box.x}px`;
  element.style.top = `${box.y}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
};

// Without a visible source, grow from a slightly smaller copy of the final frame.
const shrink = (box: Box): Box => ({ x: box.x + box.width * 0.04, y: box.y + box.height * 0.04, width: box.width * 0.92, height: box.height * 0.92 });

export function ImageLightbox({ image, onClose }: { image: PreviewImage | null; onClose: () => void }) {
  const { dialogRef, state, show, run, close, handleClose } = useMorphDialog(onClose);
  const veilRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLImageElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<SVGFEImageElement>(null);
  const filterId = `lightbox-lens-${useId().replace(/:/g, "")}`;
  const layout = useRef<Layout | null>(null);

  const apply = (next: Layout) => {
    layout.current = next;
    place(sheetRef.current!, next.sheet);
    sheetRef.current!.style.borderRadius = `${next.radius}px`;
    for (const element of [paperRef.current!, figureRef.current!]) {
      place(element, next.card);
      element.style.borderRadius = `${next.radius - 16}px`;
    }
    place(captionRef.current!, next.caption);
    place(closeRef.current!, next.close);
    mapRef.current?.setAttribute("width", String(next.sheet.width));
    mapRef.current?.setAttribute("height", String(next.sheet.height));
  };

  // The source frame, the thumbnail's paper and the picture inside it: the morph's far end.
  const sourceBoxes = (origin: HTMLElement | null | undefined, natural: { width: number; height: number }) => {
    const thumbnail = origin?.querySelector(".publication-thumbnail");
    if (!origin?.isConnected || !thumbnail) return null;
    const frame = boxOf(origin);
    if (frame.width === 0 || frame.y + frame.height < 0 || frame.y > innerHeight) return null;
    const paper = boxOf(thumbnail);
    return { frame, paper, figure: containBox(paper, natural.width, natural.height), background: getComputedStyle(thumbnail).backgroundColor };
  };

  useLayoutEffect(() => {
    const picture = figureRef.current;
    if (!image || !picture) return;
    let cancelled = false;
    // Decode first so no frame of the morph waits on the image.
    void picture.decode().catch(() => undefined).then(() => {
      if (cancelled) return;
      show(image.origin);
      const natural = { width: picture.naturalWidth || 16, height: picture.naturalHeight || 9 };
      const next = finalLayout(natural, captionRef.current!, closeRef.current!.offsetWidth);
      apply(next);
      const source = sourceBoxes(image.origin, natural);
      paperRef.current!.style.backgroundColor = source?.background ?? "#fff";
      // The lens only renders once the sheet has settled, so its map can wait a frame.
      if (fullGlass) setTimeout(() => mapRef.current?.setAttribute("href", lensMap(next.sheet.width, next.sheet.height, next.radius, next.radius - 2)));
      const dialog = dialogRef.current!;
      if (reducedMotion()) { dialog.dataset.settled = ""; return; }
      const { easing, duration } = openMotion;
      const grow = (element: Element, from: Box, to: Box) =>
        element.animate([{ transform: flip(from, to) }, { transform: "none" }], { duration, easing });
      const fadeIn = (element: Element) =>
        element.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: duration * 0.4, easing: "ease-out", fill: "backwards" });
      const from = source ?? { frame: shrink(next.sheet), paper: shrink(next.card), figure: shrink(next.card) };
      void run([
        veilRef.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }),
        grow(sheetRef.current!, from.frame, next.sheet),
        grow(paperRef.current!, from.paper, next.card),
        grow(picture, from.figure, next.card),
        fadeIn(captionRef.current!),
        fadeIn(closeRef.current!),
      ]).then(() => { if (!state.current.closing) dialog.dataset.settled = ""; });
    });
    return () => { cancelled = true; };
  }, [image]);

  // Keep the settled frame centred when the viewport changes while open.
  useEffect(() => {
    if (!image) return;
    const relayout = () => {
      const picture = figureRef.current;
      if (!layout.current || state.current.closing || !picture || !captionRef.current || !closeRef.current) return;
      const next = finalLayout({ width: picture.naturalWidth, height: picture.naturalHeight }, captionRef.current, closeRef.current.offsetWidth);
      apply(next);
      if (fullGlass) mapRef.current?.setAttribute("href", lensMap(next.sheet.width, next.sheet.height, next.radius, next.radius - 2));
    };
    addEventListener("resize", relayout);
    return () => removeEventListener("resize", relayout);
  }, [image]);

  const requestClose = () => {
    const dialog = dialogRef.current;
    const picture = figureRef.current;
    const target = layout.current;
    if (!dialog || !picture || !target) { void close(); return; }
    delete dialog.dataset.settled;
    void close(() => {
      const natural = { width: picture.naturalWidth || 16, height: picture.naturalHeight || 9 };
      const source = sourceBoxes(state.current.origin, natural) ?? { frame: shrink(target.sheet), paper: shrink(target.card), figure: shrink(target.card) };
      const { easing, duration } = closeMotion;
      const shrinkTo = (element: Element, to: Box, home: Box) =>
        element.animate([{ transform: currentTransform(element) }, { transform: flip(to, home) }], { duration, easing, fill: "forwards" });
      const fadeOut = (element: Element) => element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in", fill: "forwards" });
      return [
        veilRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.8, easing: "ease-in", fill: "forwards" }),
        shrinkTo(sheetRef.current!, source.frame, target.sheet),
        shrinkTo(paperRef.current!, source.paper, target.card),
        shrinkTo(picture, source.figure, target.card),
        fadeOut(captionRef.current!),
        fadeOut(closeRef.current!),
      ];
    });
  };

  return (
    <dialog
      className="glass-dialog image-lightbox"
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={handleClose}
      aria-label={image ? `Enlarged image: ${image.alt}` : "Image preview"}
    >
      {image && (
        <>
          <div className="glass-veil" ref={veilRef} onClick={requestClose} />
          <div className="glass-sheet lightbox-sheet" ref={sheetRef} aria-hidden="true"
            style={fullGlass ? { "--sheet-lens": `url(#${filterId})` } as CSSProperties : undefined}>
            {fullGlass && <svg className="glass-defs" focusable="false">
              <filter id={filterId} colorInterpolationFilters="sRGB">
                <feImage ref={mapRef} x={0} y={0} width={1} height={1} preserveAspectRatio="none" result="map" />
                <feDisplacementMap in="SourceGraphic" in2="map" scale={56} xChannelSelector="R" yChannelSelector="B" />
              </filter>
            </svg>}
            <span className="glass-sheet-optics" />
            <span className="glass-sheet-tint" />
          </div>
          <div className="lightbox-paper" ref={paperRef} />
          <img className="lightbox-figure" ref={figureRef} src={image.src} alt={image.alt} />
          <p className="lightbox-caption" ref={captionRef} aria-hidden="true">{image.alt}</p>
          <button className="glass-close lightbox-close" ref={closeRef} type="button" onClick={requestClose}
            aria-label="Close image preview" title="Close image preview" autoFocus>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}
    </dialog>
  );
}
