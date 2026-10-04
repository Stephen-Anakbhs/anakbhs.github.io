import { useLayoutEffect, type RefObject } from "react";
import { fullGlass } from "./glassQuality";

// Glass lettering. Each heading is filled with the wallpaper that sits behind it
// (aligned to the fixed backdrop), so the glyphs read as clear glass. In the full
// tier an SVG filter treats every stroke as a rounded rose-red glass tube: the
// background is bent inward along the curved edges and slightly darkened, the body
// takes a light red tint that deepens to wine where the glass is thickest, and a
// directional specular glint follows the top-left slopes. There is no outline.
const FILTER_ID = "liquid-heading";

type Optics = { id: string; blur: number; refraction: number; surface: number };
const opticsFor: Optics[] = [
  { id: FILTER_ID, blur: 2.8, refraction: 24, surface: 5 },
  { id: `${FILTER_ID}-compact`, blur: 2.1, refraction: 17, surface: 4 },
];

const filterMarkup = opticsFor.map(({ id, blur, refraction, surface }) => `
<filter id="${id}" x="-6%" y="-25%" width="112%" height="150%" color-interpolation-filters="sRGB">
  <feComponentTransfer in="SourceAlpha" result="mask"><feFuncA type="linear" slope="4" /></feComponentTransfer>
  <feGaussianBlur in="mask" stdDeviation="${blur}" result="soft" />
  <feConvolveMatrix in="soft" order="3 1" kernelMatrix="1 0 -1" bias="0.5" edgeMode="duplicate" result="slopeX" />
  <feConvolveMatrix in="soft" order="1 3" kernelMatrix="1 0 -1" bias="0.5" edgeMode="duplicate" result="slopeY" />
  <feColorMatrix in="slopeX" type="matrix" values="0 0 0 1 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="mapX" />
  <feColorMatrix in="slopeY" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 1 0  0 0 0 0 1" result="mapY" />
  <feComposite in="mapX" in2="mapY" operator="arithmetic" k2="1" k3="1" result="map" />
  <feDisplacementMap in="SourceGraphic" in2="map" scale="${refraction}" xChannelSelector="R" yChannelSelector="B" result="bent" />
  <feComponentTransfer in="bent" result="toned">
    <feFuncR type="linear" slope="0.88" /><feFuncG type="linear" slope="0.88" /><feFuncB type="linear" slope="0.88" />
  </feComponentTransfer>
  <feComposite in="toned" in2="mask" operator="in" result="glass" />
  <feFlood flood-color="#b8285a" flood-opacity="0.44" />
  <feComposite in2="mask" operator="in" result="tint" />
  <feComponentTransfer in="soft" result="thickness"><feFuncA type="table" tableValues="0.9 0.62 0.26 0.06 0" /></feComponentTransfer>
  <feComposite in="thickness" in2="mask" operator="in" result="edgeBand" />
  <feFlood flood-color="#4e0620" flood-opacity="0.86" />
  <feComposite in2="edgeBand" operator="in" result="edge" />
  <feSpecularLighting in="soft" surfaceScale="${surface}" specularConstant="0.9" specularExponent="26" lighting-color="#fff" result="specular">
    <feDistantLight azimuth="225" elevation="42" />
  </feSpecularLighting>
  <feComposite in="specular" in2="mask" operator="in" result="glint" />
  <feMerge><feMergeNode in="glass" /><feMergeNode in="tint" /><feMergeNode in="edge" /><feMergeNode in="glint" /></feMerge>
</filter>`).join("");

function installFilter() {
  if (!fullGlass || typeof document === "undefined" || document.getElementById(FILTER_ID)) return;
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
function align() {
  frame = 0;
  const backdrop = document.querySelector(".site-backdrop")?.getBoundingClientRect();
  if (!backdrop || !visible.size) return;
  const scale = Math.max(backdrop.width / wallpaper.width, backdrop.height / wallpaper.height);
  const width = wallpaper.width * scale;
  const height = wallpaper.height * scale;
  const left = backdrop.left + (backdrop.width - width) / 2;
  const top = backdrop.top + (backdrop.height - height) / 2;
  const rects = [...visible].map(heading => [heading, heading.getBoundingClientRect()] as const);
  const size = `${width.toFixed(1)}px ${height.toFixed(1)}px`;
  for (const [heading, rect] of rects) {
    heading.style.setProperty("--wall-size", size);
    heading.style.setProperty("--wall-position", `${(left - rect.left).toFixed(1)}px ${(top - rect.top).toFixed(1)}px`);
  }
}
const scheduleAlign = () => { if (!frame) frame = requestAnimationFrame(align); };
let settle = 0;
// Lite devices realign once scrolling settles instead of repainting every frame.
const onScroll = fullGlass ? scheduleAlign : () => { clearTimeout(settle); settle = window.setTimeout(scheduleAlign, 120); };

export function useLiquidHeading(heading: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = heading.current;
    if (!element) return;
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
