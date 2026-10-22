/** The site inside the dashboard's live 网站外观 editor (stats.renjun.one, an iframe with ?editor=look): a preview,
 * so the visit is not logged and scene changes are not remembered. */
export const inLookEditor = typeof window !== "undefined" && window.parent !== window
  && new URLSearchParams(location.search).get("editor") === "look";
