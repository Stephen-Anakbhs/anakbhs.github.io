# Local performance patch

Based on `liquid-glass-react` 1.1.1 by Max Rovensky, copied from the published
package's `dist/index.esm.js` and `dist/index.d.ts`.
Upstream: https://github.com/rdev/liquid-glass-react
The original MIT license is retained in `LICENSE`.

Local changes:

- With `aberrationIntensity={0}`, use the upstream displacement map in one
  displacement pass. Nonzero values still use the original RGB dispersion
  pipeline. Both paths refract the backdrop.
- Observe component size changes, not just window resize, and skip unchanged
  dimensions. This supports a moving navigation selection and dynamic content.
- Optional `displacementMap(width, height)` returns a map URL for the measured
  glass size. It is drawn unstretched at that size with positive displacement,
  and it replaces the built-in `mode` map (used by the site's convex lens bezel).
- The over-light contrast layers render only when `overLight` is set, and
  `rims` (2 upstream, 1 or 0) skips rim highlight layers the site never shows.
- Explicit normal-flow positioning (`relative`, `top: auto`, `left: auto`) keeps
  the library's elastic transform without the default minus-50-percent offset.

Consumers use `src/components/ui/GlassSurface.tsx`; do not import this package
directly in page components. Keep local changes here, not in `node_modules`.
