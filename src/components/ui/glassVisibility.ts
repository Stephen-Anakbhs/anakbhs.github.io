// Gate optical paint with one observer, without rebuilding lenses on every scroll.
let observer: IntersectionObserver | undefined;
let surfaceCount = 0;

export function observeGlassVisibility(surface: HTMLElement): () => void {
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      const visible = String(entry.isIntersecting);
      const element = entry.target as HTMLElement;
      if (element.dataset.glassVisible !== visible) element.dataset.glassVisible = visible;
    }
  }, { rootMargin: '80px' });
  observer.observe(surface);
  surfaceCount++;
  return () => {
    observer?.unobserve(surface);
    if (--surfaceCount === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}
