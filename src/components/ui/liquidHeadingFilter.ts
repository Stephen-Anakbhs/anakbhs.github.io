// Glass lettering for section headings: a crisp rim where light enters the glyph
// edge, a faint shade on the far edge, a sharp specular glint and a small lift.
// The glyph interior stays translucent so the wallpaper still shows through.
const FILTER_ID = "liquid-heading";

const markup = `
<filter id="${FILTER_ID}" x="-4%" y="-20%" width="108%" height="150%" color-interpolation-filters="sRGB">
  <feOffset in="SourceAlpha" dy="1" result="down" />
  <feComposite in="SourceAlpha" in2="down" operator="out" result="topEdge" />
  <feFlood flood-color="#fff" flood-opacity="0.75" />
  <feComposite in2="topEdge" operator="in" result="topRim" />
  <feOffset in="SourceAlpha" dx="0.6" dy="0.6" result="diagonal" />
  <feComposite in="SourceAlpha" in2="diagonal" operator="out" result="leftEdge" />
  <feFlood flood-color="#fff" flood-opacity="0.35" />
  <feComposite in2="leftEdge" operator="in" result="leftRim" />
  <feOffset in="SourceAlpha" dy="-1.2" result="up" />
  <feComposite in="SourceAlpha" in2="up" operator="out" result="bottomEdge" />
  <feGaussianBlur in="bottomEdge" stdDeviation="0.5" result="bottomSoft" />
  <feFlood flood-color="#071a40" flood-opacity="0.4" />
  <feComposite in2="bottomSoft" operator="in" result="bottomShade" />
  <feGaussianBlur in="SourceAlpha" stdDeviation="0.7" result="soft" />
  <feSpecularLighting in="soft" surfaceScale="1.6" specularConstant="0.9" specularExponent="38" lighting-color="#fff" result="specular">
    <feDistantLight azimuth="240" elevation="50" />
  </feSpecularLighting>
  <feComposite in="specular" in2="SourceAlpha" operator="in" result="glint" />
  <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="liftBlur" />
  <feOffset in="liftBlur" dy="1.5" result="liftOffset" />
  <feFlood flood-color="#0b1a33" flood-opacity="0.14" />
  <feComposite in2="liftOffset" operator="in" result="lift" />
  <feMerge>
    <feMergeNode in="lift" />
    <feMergeNode in="SourceGraphic" />
    <feMergeNode in="bottomShade" />
    <feMergeNode in="glint" />
    <feMergeNode in="leftRim" />
    <feMergeNode in="topRim" />
  </feMerge>
</filter>`;

// Installed once at import, before any heading paints, so the reference always resolves.
export function installLiquidHeadingFilter() {
  if (typeof document === "undefined" || document.getElementById(FILTER_ID)) return;
  const holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  holder.setAttribute("aria-hidden", "true");
  holder.setAttribute("focusable", "false");
  holder.setAttribute("width", "0");
  holder.setAttribute("height", "0");
  holder.style.position = "absolute";
  holder.innerHTML = markup;
  document.body.append(holder);
}
