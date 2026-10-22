// Windows draws flat black-and-white cursors; over this page they become glass (cursors.css).
// macOS cursors already suit the look, and touch devices have none.
export function initGlassCursor() {
  if (typeof document === "undefined") return;
  if (/Windows/.test(navigator.userAgent) && matchMedia("(pointer: fine)").matches) {
    document.documentElement.dataset.glassCursor = "";
  }
}
