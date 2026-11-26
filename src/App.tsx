import { useEffect, useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { SiteShell } from "./components/layout/SiteShell";
import { reducedMotion } from "./lib/reducedMotion";
import { getView, pageTop, setView, viewFor } from "./lib/siteView";
import { trackPageView } from "./lib/visits";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResearchPage } from "./pages/ResearchPage";

// After the routes, so section anchors exist when it runs. Across routes the view is set outright; within
// the homepage the cover's own transition changes it and lands on the section.
function ScrollPosition() {
  const location = useLocation();
  const { pathname, hash, key } = location;
  const navigation = useNavigationType();
  const previousPath = useRef<string | null>(null);
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(key);
  useEffect(() => {
    // Scroll events arrive late: by then a route change has already moved on to its own entry.
    const remember = () => { if (getView() === "content") positions.current.set(currentKey.current, window.scrollY); };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, []);
  useLayoutEffect(() => {
    currentKey.current = key;
    const samePage = previousPath.current === pathname;
    previousPath.current = pathname;
    if (!samePage) setView(viewFor(pathname, hash));
    if (getView() === "cover" || (samePage && viewFor(pathname, hash) === "cover")) return;
    // A finished transition is already where its address says; a late scroll would undo the user's own.
    if (navigation !== "POP" && (location.state as { landed?: boolean } | null)?.landed) return;
    const saved = navigation === "POP" && !samePage ? positions.current.get(key) : undefined;
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (saved !== undefined) window.scrollTo({ top: saved, behavior: "instant" });
    else if (target) target.scrollIntoView({ block: "start", behavior: samePage && !reducedMotion() ? "smooth" : "instant" });
    else window.scrollTo({ top: pageTop(), behavior: "instant" });
  }, [pathname, hash, key]);
  // iOS Safari throws a page it has just loaded back to its very top a moment after the scroll above, then returns
  // it to the section a second or more later, unless the smooth scroll back to the runway (keepPageAtRest) gets
  // there first (iOS 26.2 and 26.5). While the page is still loading (no touch, wheel or key yet, first ten
  // seconds), a page opened at a section, or redirected to one, goes straight back. A scroll that travels to the
  // top, such as a tap on the status bar, is left alone. Elsewhere the page never rests below its top.
  const loading = useRef(true);
  useEffect(() => {
    loading.current = true;
    const inputs = ["touchstart", "wheel", "keydown", "pointerdown"];
    const loaded = () => {
      loading.current = false;
      window.clearTimeout(timer);
      for (const type of inputs) window.removeEventListener(type, loaded, true);
    };
    const timer = window.setTimeout(loaded, 10_000);
    for (const type of inputs) window.addEventListener(type, loaded, { capture: true, passive: true });
    return loaded;
  }, []);
  useEffect(() => {
    const section = hash ? document.getElementById(hash.slice(1)) : null;
    const top = pageTop();
    if (!loading.current || !top || !section?.closest("main") || getView() !== "content") return;
    let last = Infinity;
    const restore = () => {
      if (!loading.current) return window.removeEventListener("scroll", restore);
      const thrown = window.scrollY < top / 2 && last > top * 2;
      last = window.scrollY;
      if (thrown && section.getBoundingClientRect().top > 40) section.scrollIntoView({ block: "start", behavior: "instant" });
    };
    window.addEventListener("scroll", restore, { passive: true });
    restore();
    return () => window.removeEventListener("scroll", restore);
  }, [key]); // a new hash always comes with a new key
  return null;
}

// One private visitor-log beacon per route (live domain only).
function VisitTracker() {
  const { pathname } = useLocation();
  useEffect(() => { trackPageView(pathname); }, [pathname]);
  return null;
}

export function App() {
  return (
    <SiteShell>
      <VisitTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<Navigate to="/#about" replace />} />
        <Route path="/research" element={<Navigate to="/publications" replace />} />
        <Route path="/publications" element={<ResearchPage />} />
        <Route path="/portfolio" element={<Navigate to="/#projects" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ScrollPosition />
    </SiteShell>
  );
}
