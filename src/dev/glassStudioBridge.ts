import { glassTypes, type GlassType } from '../content/glassSchema';

if (window.parent !== window && new URLSearchParams(location.search).has('glassStudioPreview')) {
  let picking = false;
  let hovered: Element | null = null;
  let type: GlassType = 'control';
  let highlighted = false;
  const style = document.createElement('style');
  style.textContent = '[data-glass-studio-highlight], [data-glass-studio-hover] { outline: 2px solid #238761 !important; outline-offset: 3px !important; } .showcase-overlay:has([data-glass-studio-overlay]) { opacity: 1 !important; visibility: visible !important; }';
  document.head.append(style);
  const sendCounts = () => {
    const counts: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>('[data-glass-type]').forEach(el => { const key = el.dataset.glassType!; counts[key] = (counts[key] || 0) + 1; });
    parent.postMessage({ kind: 'glass:counts', counts }, location.origin);
  };
  const focus = (scroll = false) => {
    document.querySelectorAll('[data-glass-studio-highlight]').forEach(el => el.removeAttribute('data-glass-studio-highlight'));
    document.querySelectorAll('[data-glass-studio-overlay]').forEach(el => el.removeAttribute('data-glass-studio-overlay'));
    if (type === 'selection' || type === 'navigation') document.querySelector<HTMLButtonElement>('.header-toggle button[aria-expanded="false"]')?.click();
    const matches = document.querySelectorAll<HTMLElement>(`[data-glass-type="${type}"]`);
    matches.forEach(el => { if (highlighted) el.dataset.glassStudioHighlight = ''; if (type === 'overlay') el.dataset.glassStudioOverlay = ''; });
    if (scroll) matches[0]?.scrollIntoView({ block: 'center', behavior: 'instant' });
    sendCounts();
  };
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== parent) return;
    if (e.data?.kind === 'glass:focus' && e.data.type in glassTypes) { type = e.data.type; highlighted = !!e.data.highlight; focus(e.data.scroll); }
    if (e.data?.kind === 'glass:pick') { picking = !!e.data.enabled; if (!picking) hovered?.removeAttribute('data-glass-studio-hover'); }
  });
  document.addEventListener('pointerover', e => {
    if (!picking) return;
    hovered?.removeAttribute('data-glass-studio-hover');
    hovered = (e.target as Element)?.closest('[data-glass-type]');
    hovered?.setAttribute('data-glass-studio-hover', '');
  }, true);
  document.addEventListener('click', e => {
    if (!picking) return;
    const target = (e.target as Element)?.closest<HTMLElement>('[data-glass-type]');
    if (!target) return;
    e.preventDefault(); e.stopImmediatePropagation(); picking = false;
    hovered?.removeAttribute('data-glass-studio-hover');
    parent.postMessage({ kind: 'glass:selected', type: target.dataset.glassType }, location.origin);
  }, true);
  let timer = 0;
  new MutationObserver(() => { clearTimeout(timer); timer = window.setTimeout(sendCounts, 150); }).observe(document.getElementById('root')!, { childList: true, subtree: true });
  sendCounts();
}
