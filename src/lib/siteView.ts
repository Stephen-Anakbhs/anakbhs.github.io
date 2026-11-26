// The homepage is two pages in one document: the cover (the hero, a fixed layer over the whole screen)
// and the content (everything else, which starts at the top of the document). html[data-view] says which
// one is showing. Only a finished transition changes it, so the page can never rest half way between the
// two. Both stay in one document so the navigation and wallpaper persist across the transition and the
// content is already laid out when the cover lifts. The first value is set by a script in index.html,
// before the first paint.
import { useEffect, useState } from "react";

export type SiteView = "cover" | "content";

const root = document.documentElement;
const EVENT = "rg-view-change";

export const isCoverHash = (hash: string) => hash === "" || hash === "#" || hash === "#home";
export const viewFor = (pathname: string, hash: string): SiteView => (pathname === "/" && isCoverHash(hash) ? "cover" : "content");
export const getView = (): SiteView => (root.dataset.view === "cover" ? "cover" : "content");

export function setView(view: SiteView) {
  if (root.dataset.view === view) return;
  root.dataset.view = view;
  document.dispatchEvent(new CustomEvent(EVENT, { detail: view }));
}

export function onViewChange(listener: () => void) {
  document.addEventListener(EVENT, listener);
  return () => document.removeEventListener(EVENT, listener);
}

// The content lies under the cover at the top of the document, so lazy images there count as on screen and
// would all download while the visitor is still watching the cover's film. Heavy ones wait for the content.
let contentShown = getView() === "content";
onViewChange(() => { contentShown ||= getView() === "content"; });

/** True once the content page has been shown in this visit. */
export function useContentShown() {
  const [shown, setShown] = useState(contentShown);
  useEffect(() => {
    if (shown) return;
    const update = () => { if (contentShown) setShown(true); };
    update();
    return onViewChange(update);
  }, [shown]);
  return shown;
}

/** Where the top of the page rests: 0, except on iOS (see --runway in global.css). */
export const pageTop = () => parseFloat(getComputedStyle(root).getPropertyValue("--runway")) || 0;
/** How far the document runs on past where its end rests: 0, except on iOS (see --tail in global.css). */
export const pageTail = () => parseFloat(getComputedStyle(root).getPropertyValue("--tail")) || 0;

/** On iOS the document may overshoot its resting top or end like a rubber band; it comes back once let go. */
export function keepPageAtRest() {
  if (!pageTop()) return;
  let timer = 0;
  let check = 0;
  let tries = 0;
  let touching = false;
  // Where the page belongs instead, or null while it rests between its two ends.
  const restingY = () => {
    const top = pageTop();
    if (window.scrollY < top - 1) return top;
    const end = root.scrollHeight - window.innerHeight - pageTail();
    return end > top && window.scrollY > end + 1 ? end : null;
  };
  const settle = () => {
    const y = touching ? null : restingY();
    if (y === null || tries >= 3) return;
    tries += 1;
    window.scrollTo({ top: y, behavior: "smooth" });
    // At the end of a page Safari brings its toolbar back and can drop this scroll (iOS 26.2): look again.
    window.clearTimeout(check);
    check = window.setTimeout(later, 700);
  };
  const later = () => {
    window.clearTimeout(timer);
    if (restingY() === null) tries = 0;
    else timer = window.setTimeout(settle, 120);
  };
  window.addEventListener("scroll", later, { passive: true });
  window.addEventListener("resize", later, { passive: true });
  window.addEventListener("touchstart", () => { touching = true; tries = 0; }, { passive: true });
  const release = () => { touching = false; later(); };
  window.addEventListener("touchend", release, { passive: true });
  window.addEventListener("touchcancel", release, { passive: true });
}
