import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteShell } from "./components/layout/SiteShell";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((module) => ({ default: module.ResearchPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));

// Inside Suspense so section anchors resolve after the lazy route has mounted.
function ScrollPosition() {
  const { pathname, hash, key } = useLocation();
  const previousPath = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    const samePage = previousPath.current === pathname;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (target) target.scrollIntoView({ block: "start", behavior: samePage && !reduced ? "smooth" : "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
    previousPath.current = pathname;
  }, [pathname, hash, key]);
  return null;
}

export function App() {
  return (
    <SiteShell>
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
