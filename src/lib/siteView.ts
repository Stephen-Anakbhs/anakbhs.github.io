// The homepage is two pages in one document: the cover (the hero, a fixed layer over the whole screen)
// and the content (everything else, which starts at the top of the document). html[data-view] says which
// one is showing. Only a finished transition changes it, so the page can never rest half way between the
// two. Both stay in one document so the navigation and wallpaper persist across the transition and the
// content is already laid out when the cover lifts. The first value is set by a script in index.html,
// before the first paint.
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

/** Where the document rests under the cover: 0, except on iOS (see --runway in global.css). */
export const coverTop = () => parseFloat(getComputedStyle(root).getPropertyValue("--runway")) || 0;
