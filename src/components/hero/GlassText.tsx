import { useEffect, type RefObject } from "react";

// Text as frosted glass over the hero video, the way the lock-screen clock sits on an iOS
// wallpaper. The element keeps its text (for readers, search and selection) but draws it
// transparent; a layer inside it blurs and lightens the video and is masked to the glyphs. The
// mask is painted on a canvas word by word where the browser laid each word out, so it follows
// the browser's wrapping and fonts, and repaints as the text changes.
const pixelScale = () => Math.min(window.devicePixelRatio || 1, 2);

function paintGlyphs(element: HTMLElement, box: DOMRect) {
  if (!box.width || !box.height) return null;
  const scale = pixelScale();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.width * scale);
  canvas.height = Math.ceil(box.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(scale, scale);
  context.fillStyle = "#fff";
  context.textBaseline = "alphabetic";
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let painted = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || parent.closest(".glass-text-layer")) continue;
    const style = getComputedStyle(parent);
    const size = parseFloat(style.fontSize);
    context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    const ascent = context.measureText("H").fontBoundingBoxAscent || size * 0.95;
    for (const match of text.data.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      context.fillText(match[0], rect.left - box.left, rect.top - box.top + ascent);
      painted = true;
    }
  }
  return painted ? canvas.toDataURL() : null;
}

/** Keeps the glass layer inside `ref`'s element masked to its current text. */
export function useGlassText(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const layer = element?.querySelector<HTMLElement>(":scope > .glass-text-layer");
    if (!element || !layer) return;
    let frame = 0;
    let disposed = false;
    const draw = () => {
      frame = 0;
      const glyphs = paintGlyphs(element, element.getBoundingClientRect());
      if (!glyphs) { delete element.dataset.glass; return; }
      layer.style.setProperty("--glyphs", `url("${glyphs}")`);
      element.dataset.glass = "";
    };
    const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
    void document.fonts.ready.then(schedule);
    // The font can arrive after the first paint without changing the box.
    document.fonts.addEventListener("loadingdone", schedule);
    const size = new ResizeObserver(schedule);
    size.observe(element);
    const text = new MutationObserver(schedule);
    text.observe(element, { childList: true, characterData: true, subtree: true });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", schedule);
      size.disconnect();
      text.disconnect();
      delete element.dataset.glass;
    };
  }, [ref]);
}

export function GlassTextLayer() {
  return <span className="glass-text-layer" aria-hidden="true" data-liquid-ignore="" />;
}
