import { useLayoutEffect, type RefObject } from "react";
import { fullGlass } from "./glassQuality";

// Glass lettering, modelled on clear tinted glass rather than a bevel. Each heading is
// filled with the wallpaper that sits behind it (aligned to the fixed backdrop), so the
// glyphs are see-through. The filter refracts that background along the rounded stroke
// edges (the edge is defined by bending, not by light/dark bevel lines), filters it
// through red multiplicatively so it stays red and transparent over the light stone,
// deepens the red slightly where the glass is thickest, and adds an even hairline rim
// with a faint specular glint. No shadow, no offset highlights.
const FILTER_ID = "liquid-heading";

type Optics = { id: string; blur: number; refraction: number };
const opticsFor: Optics[] = [
  { id: FILTER_ID, blur: 3.4, refraction: 36 },
  { id: `${FILTER_ID}-compact`, blur: 2.6, refraction: 26 },
];

const filterMarkup = opticsFor.map(({ id, blur, refraction }) => `
<filter id="${id}" x="-6%" y="-25%" width="112%" height="150%" color-interpolation-filters="sRGB">
  <feComponentTransfer in="SourceAlpha" result="mask"><feFuncA type="linear" slope="4" /></feComponentTransfer>
  <feGaussianBlur in="mask" stdDeviation="${blur}" result="soft" />
  <feConvolveMatrix in="soft" order="3 1" kernelMatrix="1 0 -1" bias="0.5" edgeMode="duplicate" result="slopeX" />
  <feConvolveMatrix in="soft" order="1 3" kernelMatrix="1 0 -1" bias="0.5" edgeMode="duplicate" result="slopeY" />
  <feColorMatrix in="slopeX" type="matrix" values="0 0 0 1 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="mapX" />
  <feColorMatrix in="slopeY" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 1 0  0 0 0 0 1" result="mapY" />
  <feComposite in="mapX" in2="mapY" operator="arithmetic" k2="1" k3="1" result="map" />
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${refraction}" xChannelSelector="R" yChannelSelector="B" result="bent" />
  <feComponentTransfer in="bent" result="clear">
    <feFuncR type="linear" slope="1.04" /><feFuncG type="linear" slope="0.5" /><feFuncB type="linear" slope="0.49" />
  </feComponentTransfer>
  <feComponentTransfer in="bent" result="thick">
    <feFuncR type="linear" slope="0.88" /><feFuncG type="linear" slope="0.22" /><feFuncB type="linear" slope="0.22" />
  </feComponentTransfer>
  <feComponentTransfer in="soft" result="thin"><feFuncA type="table" tableValues="0.9 0.6 0.25 0.05 0 0" /></feComponentTransfer>
  <feComposite in="thick" in2="thin" operator="in" result="edgeGlass" />
  <feMerge result="glass"><feMergeNode in="clear" /><feMergeNode in="edgeGlass" /></feMerge>
  <feComposite in="glass" in2="mask" operator="in" result="body" />
  <feMorphology in="mask" operator="erode" radius="0.8" result="inner" />
  <feComposite in="mask" in2="inner" operator="out" result="ring" />
  <feGaussianBlur in="ring" stdDeviation="0.3" result="ringSoft" />
  <feFlood flood-color="#ffffff" flood-opacity="0.58" />
  <feComposite in2="ringSoft" operator="in" result="rim" />
  <feSpecularLighting in="soft" surfaceScale="1.2" specularConstant="1" specularExponent="70" lighting-color="#fff" result="specular">
    <feDistantLight azimuth="235" elevation="30" />
  </feSpecularLighting>
  <feComposite in="specular" in2="mask" operator="in" result="glintRaw" />
  <feComponentTransfer in="glintRaw" result="glint"><feFuncA type="linear" slope="0.6" /></feComponentTransfer>
  <feMerge><feMergeNode in="body" /><feMergeNode in="rim" /><feMergeNode in="glint" /></feMerge>
</filter>`).join("");

function installFilter() {
  if (typeof document === "undefined" || document.getElementById(FILTER_ID)) return;
  const holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  holder.setAttribute("aria-hidden", "true");
  holder.setAttribute("focusable", "false");
  holder.setAttribute("width", "0");
  holder.setAttribute("height", "0");
  holder.style.position = "absolute";
  holder.innerHTML = filterMarkup;
  document.body.append(holder);
}
installFilter();

// The backdrop image is 2560x1520, object-fit: cover over the fixed viewport layer.
const wallpaper = { width: 2560, height: 1520 };
const visible = new Set<HTMLElement>();
let observer: IntersectionObserver | undefined;
let frame = 0;

// Reads every rect before writing, so one frame costs one layout at most.
function align(headings: Iterable<HTMLElement>) {
  const backdrop = document.querySelector(".site-backdrop")?.getBoundingClientRect();
  if (!backdrop) return;
  const scale = Math.max(backdrop.width / wallpaper.width, backdrop.height / wallpaper.height);
  const width = wallpaper.width * scale;
  const height = wallpaper.height * scale;
  const left = backdrop.left + (backdrop.width - width) / 2;
  const top = backdrop.top + (backdrop.height - height) / 2;
  const rects = [...headings].map(heading => [heading, heading.getBoundingClientRect()] as const);
  const size = `${width.toFixed(1)}px ${height.toFixed(1)}px`;
  for (const [heading, rect] of rects) {
    heading.style.setProperty("--wall-size", size);
    heading.style.setProperty("--wall-position", `${(left - rect.left).toFixed(1)}px ${(top - rect.top).toFixed(1)}px`);
  }
}
const scheduleAlign = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; align(visible); }); };
let settle = 0;
// Lite devices realign once scrolling settles instead of repainting every frame.
const onScroll = fullGlass ? scheduleAlign : () => { clearTimeout(settle); settle = window.setTimeout(scheduleAlign, 120); };

export function useLiquidHeading(heading: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = heading.current;
    if (!element) return;
    align([element]);
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
          else visible.delete(entry.target as HTMLElement);
        }
        scheduleAlign();
      }, { rootMargin: "200px 0px" });
      addEventListener("scroll", onScroll, { passive: true });
      addEventListener("resize", scheduleAlign);
    }
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      visible.delete(element);
    };
  }, [heading]);
}
