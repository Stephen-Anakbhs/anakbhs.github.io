import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { animate, type AnimationPlaybackControls } from "framer-motion";
import { X } from "lucide-react";
import { lensMap } from "./lensMap";
import "../../styles/lightbox.css";

export type PreviewImage = { src: string; alt: string; origin?: HTMLElement | null };

type Box = { x: number; y: number; width: number; height: number };
type Frame = { sheet: Box; card: Box; sheetRadius: number; cardRadius: number };
type Layout = Frame & { gap: number; lensScale: number; compact: boolean };

// Liquid-DOM style morph: a springy open that overshoots slightly, and a firmer close.
const openSpring = { type: "spring", stiffness: 240, damping: 24, mass: 1 } as const;
const closeSpring = { type: "spring", stiffness: 380, damping: 38, mass: 1 } as const;
const supportsLens = !navigator.userAgent.toLowerCase().includes("firefox");

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (from: Box, to: Box, t: number): Box => ({
  x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t),
  width: Math.max(1, lerp(from.width, to.width, t)), height: Math.max(1, lerp(from.height, to.height, t)),
});
const boxOf = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};
const place = (element: HTMLElement, box: Box, radius?: number) => {
  element.style.translate = `${box.x}px ${box.y}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
  if (radius !== undefined) element.style.borderRadius = `${radius}px`;
};

function finalLayout(natural: { width: number; height: number }, caption: HTMLElement): Layout {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const compact = viewportWidth < 640;
  const margin = compact ? 12 : 36;
  const pad = compact ? 10 : 16;
  const gap = compact ? 10 : 14;
  const sheetRadius = compact ? 24 : 32;
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
  const sheet = { width: width + 2 * pad, height: pad + height + gap + text + pad, x: 0, y: 0 };
  sheet.x = (viewportWidth - sheet.width) / 2;
  sheet.y = Math.max(margin, (viewportHeight - sheet.height) / 2);
  return {
    sheet, card: { x: sheet.x + pad, y: sheet.y + pad, width, height },
    sheetRadius, cardRadius: sheetRadius - pad, gap, lensScale: compact ? 36 : 64, compact,
  };
}

function originFrame(origin: HTMLElement | null | undefined, target: Layout): Frame {
  const thumbnail = origin?.querySelector(".publication-thumbnail");
  if (origin?.isConnected && thumbnail) {
    const sheet = boxOf(origin);
    if (sheet.width > 0 && sheet.y + sheet.height > 0 && sheet.y < window.innerHeight) {
      return { sheet, card: boxOf(thumbnail), sheetRadius: parseFloat(getComputedStyle(origin).borderRadius) || 8, cardRadius: 3 };
    }
  }
  // Without a visible source, grow from a slightly smaller copy of the final frame.
  const shrink = (box: Box): Box => ({ x: box.x + box.width * 0.04, y: box.y + box.height * 0.04, width: box.width * 0.92, height: box.height * 0.92 });
  return { sheet: shrink(target.sheet), card: shrink(target.card), sheetRadius: target.sheetRadius, cardRadius: target.cardRadius };
}

export function ImageLightbox({ image, onClose }: { image: PreviewImage | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<SVGFEImageElement>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null);
  const filterId = `lightbox-lens-${useId().replace(/:/g, "")}`;
  const state = useRef<{ progress: number; from?: Frame; to?: Layout; controls?: AnimationPlaybackControls; closing: boolean; origin?: HTMLElement | null }>({ progress: 0, closing: false });
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const render = (progress: number) => {
    const { from, to } = state.current;
    const sheet = sheetRef.current;
    const card = cardRef.current;
    if (!from || !to || !sheet || !card) return;
    state.current.progress = progress;
    const settled = clamp01(progress);
    const sheetBox = mix(from.sheet, to.sheet, progress);
    const cardBox = mix(from.card, to.card, progress);
    place(sheet, sheetBox, lerp(from.sheetRadius, to.sheetRadius, settled));
    place(card, cardBox, lerp(from.cardRadius, to.cardRadius, settled));
    mapRef.current?.setAttribute("width", String(sheetBox.width));
    mapRef.current?.setAttribute("height", String(sheetBox.height));
    displacementRef.current?.setAttribute("scale", (to.lensScale * sheetBox.width / to.sheet.width).toFixed(2));
    // Text and controls materialise once the glass has mostly arrived.
    const late = clamp01((settled - 0.55) / 0.45);
    const caption = captionRef.current;
    if (caption) {
      caption.style.translate = `${cardBox.x}px ${cardBox.y + cardBox.height + to.gap}px`;
      caption.style.opacity = String(late);
      caption.style.filter = late < 1 ? `blur(${(1 - late) * 6}px)` : "";
    }
    const close = closeRef.current;
    if (close) {
      // Small screens float the button above the sheet so it never covers a short figure.
      const size = close.offsetWidth;
      const above = to.compact && to.sheet.y >= size + 16;
      close.style.translate = above
        ? `${sheetBox.x + sheetBox.width - size}px ${sheetBox.y - size - 10}px`
        : `${cardBox.x + cardBox.width - size - 10}px ${cardBox.y + 10}px`;
      close.style.opacity = String(late);
    }
    if (veilRef.current) veilRef.current.style.opacity = String(settled);
  };

  const finish = () => {
    const { origin } = state.current;
    if (origin) origin.style.visibility = "";
    state.current.controls?.stop();
    state.current = { progress: 0, closing: false };
  };

  const requestClose = () => {
    const current = state.current;
    const dialog = dialogRef.current;
    if (!dialog?.open || current.closing) return;
    current.closing = true;
    current.controls?.stop();
    const closeNow = () => { if (current.origin) current.origin.style.visibility = ""; dialog.close(); };
    if (current.to) current.from = originFrame(current.origin, current.to);
    if (!current.to || matchMedia("(prefers-reduced-motion: reduce)").matches) { closeNow(); return; }
    current.controls = animate(current.progress, 0, { ...closeSpring, onUpdate: render, onComplete: closeNow });
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!image) {
      if (dialog.open) dialog.close();
      return;
    }
    const picture = imageRef.current;
    const caption = captionRef.current;
    if (!picture || !caption) return;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      // Open first so the caption can be measured; everything is placed before the next paint.
      if (!dialog.open) {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
      const to = finalLayout({ width: picture.naturalWidth || 16, height: picture.naturalHeight || 9 }, caption);
      const from = originFrame(image.origin, to);
      state.current = { progress: 0, from, to, closing: false, origin: image.origin };
      if (supportsLens) mapRef.current?.setAttribute("href", lensMap(to.sheet.width, to.sheet.height, to.sheetRadius, to.sheetRadius - 2));
      if (image.origin) image.origin.style.visibility = "hidden";
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { render(1); return; }
      render(0);
      state.current.controls = animate(0, 1, { ...openSpring, onUpdate: render });
    };
    if (picture.complete && picture.naturalWidth) start();
    else picture.addEventListener("load", start, { once: true });
    return () => { cancelled = true; picture.removeEventListener("load", start); };
  }, [image]);

  // Keep the settled frame centred when the viewport changes while open.
  useEffect(() => {
    if (!image) return;
    const relayout = () => {
      const current = state.current;
      const picture = imageRef.current;
      if (!current.to || current.closing || !picture || !captionRef.current) return;
      current.controls?.stop();
      current.to = finalLayout({ width: picture.naturalWidth, height: picture.naturalHeight }, captionRef.current);
      if (supportsLens) mapRef.current?.setAttribute("href", lensMap(current.to.sheet.width, current.to.sheet.height, current.to.sheetRadius, current.to.sheetRadius - 2));
      render(1);
    };
    window.addEventListener("resize", relayout);
    return () => window.removeEventListener("resize", relayout);
  }, [image]);

  useEffect(() => () => finish(), []);

  return (
    <dialog
      className="image-lightbox"
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={() => {
        finish();
        // Not every browser restores focus when a modal dialog closes.
        if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
        returnFocus.current = null;
        onCloseRef.current();
      }}
      aria-label={image ? `Enlarged image: ${image.alt}` : "Image preview"}
    >
      {image && (
        <>
          <div className="lightbox-veil" ref={veilRef} onClick={requestClose} />
          <div className="lightbox-sheet" ref={sheetRef} aria-hidden="true">
            <svg className="lightbox-defs" focusable="false">
              <filter id={filterId} colorInterpolationFilters="sRGB">
                <feImage ref={mapRef} x={0} y={0} width={1} height={1} preserveAspectRatio="none" result="map" />
                <feDisplacementMap ref={displacementRef} in="SourceGraphic" in2="map" scale={0} xChannelSelector="R" yChannelSelector="B" />
              </filter>
            </svg>
            <span className="lightbox-optics" style={supportsLens ? { filter: `url(#${filterId})` } : undefined} />
            <span className="lightbox-tint" />
          </div>
          <div className="lightbox-card" ref={cardRef}>
            <img ref={imageRef} src={image.src} alt={image.alt} decoding="async" />
          </div>
          <p className="lightbox-caption" ref={captionRef} aria-hidden="true">{image.alt}</p>
          <button className="lightbox-close" ref={closeRef} type="button" onClick={requestClose} aria-label="Close image preview" title="Close image preview" autoFocus>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}
    </dialog>
  );
}
