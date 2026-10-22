import { useEffect, useRef } from "react";

// The hero title as frosted glass over the video, the way the lock-screen clock sits on an iOS
// wallpaper. The heading keeps its text (for readers, search and selection) but draws it
// transparent; a layer over it blurs and lightens the video and is masked to the glyphs. The mask
// is painted on a canvas from the heading's own lines, so it follows the browser's wrapping.
const pixelScale = () => Math.min(window.devicePixelRatio || 1, 2);

function paintGlyphs(heading: HTMLElement, box: DOMRect) {
  const node = heading.firstChild;
  if (!(node instanceof Text) || !box.width || !box.height) return null;
  const scale = pixelScale();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.width * scale);
  canvas.height = Math.ceil(box.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  const style = getComputedStyle(heading);
  const size = parseFloat(style.fontSize);
  context.scale(scale, scale);
  context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
  context.fillStyle = "#fff";
  context.textBaseline = "alphabetic";
  const ascent = context.measureText("H").fontBoundingBoxAscent || size * 0.95;
  // Each line as the browser laid it out: words grouped by the line they landed on.
  const text = node.data;
  const lines: { top: number; left: number; words: string[] }[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const range = document.createRange();
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match[0].length);
    const rect = range.getClientRects()[0];
    if (!rect) continue;
    const line = lines.find((item) => Math.abs(item.top - rect.top) < 2);
    if (line) line.words.push(match[0]);
    else lines.push({ top: rect.top, left: rect.left, words: [match[0]] });
  }
  for (const line of lines) context.fillText(line.words.join(" "), line.left - box.left, line.top - box.top + ascent);
  return canvas.toDataURL();
}

export function GlassTitle({ text }: { text: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const glass = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = heading.current;
    const layer = glass.current;
    if (!element || !layer) return;
    let frame = 0;
    let disposed = false;
    const draw = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const glyphs = paintGlyphs(element, box);
      if (!glyphs) { delete element.dataset.glass; return; }
      layer.style.setProperty("--glyphs", `url("${glyphs}")`);
      layer.style.width = `${box.width}px`;
      layer.style.height = `${box.height}px`;
      element.dataset.glass = "";
    };
    const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
    void document.fonts.ready.then(schedule);
    // The heading font can arrive after the first paint without changing the box.
    document.fonts.addEventListener("loadingdone", schedule);
    const watch = new ResizeObserver(schedule);
    watch.observe(element);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", schedule);
      watch.disconnect();
      delete element.dataset.glass;
    };
  }, [text]);

  return (
    <div className="hero-title">
      <h1 ref={heading}>{text}</h1>
      <span ref={glass} className="hero-title-glass" aria-hidden="true" data-liquid-ignore="" />
    </div>
  );
}
