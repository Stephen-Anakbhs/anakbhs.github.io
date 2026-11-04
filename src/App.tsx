import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { SiteShell } from "./components/layout/SiteShell";
import { getView, setView, viewFor } from "./lib/siteView";
import { trackPageView } from "./lib/visits";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((module) => ({ default: module.ResearchPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));

// Inside Suspense so section anchors resolve after the lazy route has mounted. Across routes the view is
// set outright; within the homepage the cover's own transition changes it and lands on the section.
function ScrollPosition() {
  const location = useLocation();
  const { pathname, hash, key } = location;
  const navigation = useNavigationType();
  const previousPath = useRef<string | null>(null);
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    const remember = () => { if (getView() === "content") positions.current.set(key, window.scrollY); };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, [key]);
  useLayoutEffect(() => {
    const samePage = previousPath.current === pathname;
    previousPath.current = pathname;
    if (!samePage) setView(viewFor(pathname, hash));
    if (getView() === "cover") return;
    // A finished transition is already where its address says; a late scroll would undo the user's own.
    if (navigation !== "POP" && (location.state as { landed?: boolean } | null)?.landed) return;
    const saved = navigation === "POP" && !samePage ? positions.current.get(key) : undefined;
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (saved !== undefined) window.scrollTo({ top: saved, behavior: "instant" });
    else if (target) target.scrollIntoView({ block: "start", behavior: samePage && !reduced ? "smooth" : "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash, key]);
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
      <Suspense fallback={<main className="subpage route-loading" id="main-content" tabIndex={-1}><p role="status">Loading page...</p></main>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<Navigate to="/#about" replace />} />
          <Route path="/research" element={<Navigate to="/publications" replace />} />
          <Route path="/publications" element={<ResearchPage />} />
          <Route path="/portfolio" element={<Navigate to="/#projects" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ScrollPosition />
      </Suspense>
    </SiteShell>
  );
}
