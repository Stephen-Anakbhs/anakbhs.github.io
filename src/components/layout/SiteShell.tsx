import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { site } from "../../content/site";
import { GlassSurface } from "../ui/GlassSurface";
import { LiquidNavigation } from "./LiquidNavigation";
import { GlassScrollbar } from "./GlassScrollbar";
import "../../styles/site-background.css";

export function SiteShell({ children }: PropsWithChildren) {
  const [tone, setTone] = useState<"light" | "dark">("dark");
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const pendingSection = useRef<string | null>(null);
  const refreshScrollState = useRef<() => void>(() => {});
  const [menuOpen, setMenuOpen] = useState(() => window.matchMedia("(min-width: 641px)").matches);
  const menuButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  const selectSection = (id: string) => {
    pendingSection.current = id;
    setActiveSection(id);
    refreshScrollState.current();
  };

  useEffect(() => {
    let frame = 0;
    let measureLayout = true;
    let heroBottom: number | null = null;
    let sections: { id: string; top: number }[] = [];
    const updateTone = () => {
      const y = window.scrollY;
      if (measureLayout) {
        const hero = document.querySelector(".hero");
        heroBottom = hero ? hero.getBoundingClientRect().bottom + y : null;
        sections = Array.from(document.querySelectorAll<HTMLElement>("main [data-nav-section]"), (section) => ({
          id: section.dataset.navSection || "home", top: section.getBoundingClientRect().top + y,
        }));
        measureLayout = false;
      }
      setScrolled(y > 96);
      const overHero = location.pathname === "/" && heroBottom !== null && heroBottom - y > 72;
      setTone(overHero ? "dark" : "light");
      const pending = pendingSection.current;
      if (pending) {
        // A click selects its destination immediately; sections crossed by the
        // smooth scroll must not pull the lens away from that destination.
        const target = location.pathname === "/" ? document.getElementById(pending) : null;
        if (target) {
          const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
          const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const targetY = Math.max(0, Math.min(maxY, target.getBoundingClientRect().top + y - margin));
          if (Math.abs(y - targetY) <= 2) pendingSection.current = null;
        }
        setActiveSection(pending);
      } else if (location.pathname === "/") {
        const marker = Math.min(window.innerHeight * 0.3, 220);
        let current = "home";
        sections.forEach((section) => {
          if (section.top <= y + marker) current = section.id;
        });
        setActiveSection(current);
      } else {
        setActiveSection(location.pathname === "/publications" ? "publications" : "");
      }
      frame = 0;
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateTone);
    };
    const scheduleMeasure = () => { measureLayout = true; scheduleUpdate(); };
    const releaseSelection = () => {
      if (!pendingSection.current) return;
      pendingSection.current = null;
      scheduleUpdate();
    };
    const interruptScroll = () => {
      if (!pendingSection.current) return;
      releaseSelection();
      window.scrollTo({ top: window.scrollY, behavior: "instant" });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".site-header")) return;
      interruptScroll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interruptScroll();
    };
    refreshScrollState.current = scheduleUpdate;
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scrollend", releaseSelection);
    window.addEventListener("wheel", interruptScroll, { passive: true });
    window.addEventListener("touchstart", interruptScroll, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", scheduleMeasure);
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      refreshScrollState.current = () => {};
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scrollend", releaseSelection);
      window.removeEventListener("wheel", interruptScroll);
      window.removeEventListener("touchstart", interruptScroll);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", scheduleMeasure);
      observer.disconnect();
    };
  }, [location.pathname]);

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 640px)");
    const update = () => setMenuOpen(!compact.matches);
    compact.addEventListener("change", update);
    return () => compact.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setMenuOpen(false);
  }, [location.key]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="site-backdrop" aria-hidden="true">
        <img src="/media/cold-stone.webp" alt="" />
      </div>
      <GlassScrollbar tone="dark" />
      <header className={`site-header${scrolled ? " is-scrolled" : ""}`} data-tone={tone} data-liquid-ignore="" aria-label="Primary navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            setMenuOpen(false);
            menuButton.current?.focus();
          }
        }}>
        <Link className="brand" to="/#home" aria-label={`${site.name} home`}>
          {site.shortName}
        </Link>
        <div id="site-navigation" className="nav-reveal" inert={!menuOpen} aria-hidden={!menuOpen}>
          <GlassSurface material="navigation" className="header-navigation" tone={tone} data-open={menuOpen}>
            <LiquidNavigation tone={tone} activeSection={activeSection} onSelect={selectSection} open={menuOpen} />
          </GlassSurface>
        </div>
        <GlassSurface material="navigation" className="header-toggle" tone={tone}>
          <button ref={menuButton} className="glass-action glass-icon" type="button" aria-controls="site-navigation"
            aria-expanded={menuOpen} aria-label={menuOpen ? "Collapse menu" : "Expand menu"}
            title={menuOpen ? "Collapse menu" : "Expand menu"} onClick={() => setMenuOpen((open) => !open)}>
            <span className="menu-glyph" data-open={menuOpen} aria-hidden="true">
              <Menu className="menu-glyph-open" size={22} strokeWidth={1.7} />
              <X className="menu-glyph-close" size={22} strokeWidth={1.7} />
            </span>
          </button>
        </GlassSurface>
      </header>

      {children}

      <footer className="site-footer">
        <span>Renjun Gao &copy; {new Date().getFullYear()}. All rights reserved.</span>
      </footer>
    </div>
  );
}
