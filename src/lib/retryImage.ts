import type { SyntheticEvent } from "react";

// A figure of a few megabytes cut off by a dropped connection would otherwise stay broken: one more try,
// a moment later. Setting src again also re-chooses among a <picture>'s sources.
export function retryOnce(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.retried !== undefined || !navigator.onLine) return;
  image.dataset.retried = "";
  window.setTimeout(() => {
    const src = image.getAttribute("src");
    if (src && image.isConnected) image.src = src;
  }, 2000);
}
