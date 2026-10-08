import type { Plugin } from 'vite';

// OverlayScrollbars 2.16.0 rewrites viewport tokens even for a no-op update.
// On the document viewport this invalidates the entire page during modal motion.
const before = `    const n = createAllOverflowStyleClassNames(true).concat(createAllOverflowStyleClassNames()).join(" ");
    p(n);
    p(keys(t).map((n => createViewportOverflowStyleClassName(t[n], n === "x"))).join(" "), true);`;

const after = `    const overflowTokens = createAllOverflowStyleClassNames(true).concat(createAllOverflowStyleClassNames());
    const previous = getAttr(a, j) || "";
    const retained = previous.split(" ").filter(token => token && !overflowTokens.includes(token));
    const desired = keys(t).map(n => createViewportOverflowStyleClassName(t[n], n === "x"));
    const next = deduplicateArray(concat(retained, desired)).join(" ");
    if (previous !== next) setAttrs(a, j, next);`;

export function scrollbarOverflowPatch(): Plugin {
  return {
    name: 'scrollbar-atomic-overflow',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith('/overlayscrollbars/overlayscrollbars.mjs')) return;
      const normalized = code.replaceAll('\r\n', '\n');
      if (!normalized.includes(before)) throw new Error('OverlayScrollbars overflow setter changed; review the local performance patch.');
      return { code: normalized.replace(before, after), map: null };
    },
  };
}
