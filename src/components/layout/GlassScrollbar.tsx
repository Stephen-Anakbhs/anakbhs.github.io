import { useEffect, useId, useMemo, useRef } from "react";
import { OverlayScrollbars, type OverlayScrollbars as ScrollbarsInstance } from "overlayscrollbars";
import "overlayscrollbars/styles/overlayscrollbars.css";
import "../../styles/glass-scrollbar.css";
import { useGlassProfile } from '../../content/glassStore';
import { rgba } from '../../content/glassSchema';

function makeLensMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const dx = (x - 11.5) / 12;
      const dy = (y - Math.max(12, Math.min(116, y))) / 12;
      const edge = Math.pow(Math.min(1, Math.hypot(dx, dy)), 3);
      const offset = (y * canvas.width + x) * 4;
      pixels.data.set([128 + 110 * dx * edge, 128, 128 + 110 * dy * edge, 255], offset);
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

export function GlassScrollbar({ tone }: { tone: "light" | "dark" }) {
  const profile = useGlassProfile('scrollbar');
  const id = `scrollbar-lens-${useId().replace(/:/g, "")}`;
  const map = useMemo(makeLensMap, []);
  const instance = useRef<ScrollbarsInstance | null>(null);

  useEffect(() => {
    // Keep native touch scrolling and the OS's high-contrast scrollbar.
    if (window.matchMedia("(pointer: coarse), (forced-colors: active)").matches) return;
    const scrollbar = OverlayScrollbars({ target: document.body, cancel: { body: null } }, {
      overflow: { x: "hidden", y: "scroll" },
      update: {
        ignoreMutation: ({ target }) => {
          const element = target instanceof Element ? target : target.parentElement;
          return !!element?.closest(".site-header, .liquid-surface, .typewriter-line, [data-liquid-ignore]");
        },
      },
      scrollbars: { theme: "os-theme-glass", autoHide: "scroll", autoHideDelay: 1000, autoHideSuspend: false, dragScroll: true, clickScroll: "instant" },
    });
    instance.current = scrollbar;
    const { scrollbar: bar, handle } = scrollbar.elements().scrollbarVertical;
    bar.setAttribute("data-liquid-ignore", "");
    bar.dataset.glassType = 'scrollbar';
    bar.style.setProperty("--scrollbar-optics", `url("#${id}")`);
    handle.tabIndex = 0;
    handle.setAttribute("role", "scrollbar");
    handle.setAttribute("aria-label", "Page scroll");
    handle.setAttribute("aria-controls", "root");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    const updateValue = () => {
      const range = document.documentElement.scrollHeight - window.innerHeight;
      handle.tabIndex = range > 0 ? 0 : -1;
      handle.setAttribute("aria-valuenow", String(range > 0 ? Math.round(window.scrollY / range * 100) : 0));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const destinations: Record<string, number> = {
        ArrowDown: window.scrollY + 48, ArrowUp: window.scrollY - 48,
        PageDown: window.scrollY + window.innerHeight * 0.9,
        PageUp: window.scrollY - window.innerHeight * 0.9,
        Home: 0, End: range,
      };
      if (!(event.key in destinations)) return;
      event.preventDefault();
      window.scrollTo({ top: destinations[event.key], behavior: "instant" });
    };
    scrollbar.on("scroll", updateValue);
    scrollbar.on("updated", updateValue);
    handle.addEventListener("keydown", onKeyDown);
    updateValue();
    return () => {
      handle.removeEventListener("keydown", onKeyDown);
      scrollbar.destroy();
      instance.current = null;
    };
  }, [id]);

  useEffect(() => {
    const bar = instance.current?.elements().scrollbarVertical.scrollbar;
    if (bar) bar.dataset.tone = tone;
  }, [tone]);

  useEffect(() => {
    const scrollbar = instance.current;
    if (!scrollbar) return;
    scrollbar.options({ scrollbars: { autoHideDelay: Number(profile.idleDelay) } });
    const bar = scrollbar.elements().scrollbarVertical.scrollbar;
    const vars = { '--os-padding-perpendicular': `${(18 - Number(profile.width)) / 2}px`,
      '--scrollbar-blur': `${profile.blurPx}px`, '--scrollbar-saturation': `${profile.saturation}%`,
      '--scrollbar-tint': rgba(String(profile.fillColor), Number(profile.fillOpacity)),
      '--scrollbar-shadow': rgba('#000000', Number(profile.shadowOpacity)), '--scrollbar-fade': `${profile.fadeMs}ms` };
    Object.entries(vars).forEach(([key, value]) => bar.style.setProperty(key, value));
  }, [profile]);

  return <svg className="scrollbar-filter" aria-hidden="true" data-liquid-ignore="">
    <defs>
      <filter id={id} x="-30%" y="-5%" width="160%" height="110%" colorInterpolationFilters="sRGB">
        <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="lens-map" />
        <feDisplacementMap in="SourceGraphic" in2="lens-map" scale={Number(profile.displacementScale)} xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </defs>
  </svg>;
}
