# anakbhs.github.io

Design-forward personal homepage for `renjun.one`.

## Stack

- Vite + React + TypeScript
- React Router for pages
- Markdown blog posts loaded from `src/content/blog`
- Three.js through `@react-three/fiber`
- GitHub Pages build workflow in `.github/workflows/pages.yml`

## Commands

```powershell
npm install
npm run dev
npm run build
npm run typecheck
```

Build output is in `dist/`. The GitHub Pages workflow publishes this directory.
For GitHub Actions deployment, select **GitHub Actions** as the Pages source and
set the custom domain to `renjun.one` in the repository's Pages settings; Actions
deployment does not use `CNAME` to configure the domain. The root `CNAME` and
`public/CNAME` also record the intended domain for branch-based publishing.

`anakbhs.com` and `www.anakbhs.com` are intended to redirect to `renjun.one`.
This requires a redirect service that accepts HTTPS on the old domain; changing
DNS alone does not create an HTTP redirect. Apply the live domain changes when
the site is ready for release.

Unpublished full manuscripts are retained locally in `.private/papers/`.
This directory is ignored by Git and excluded from the production build. Keep
manuscripts out of `public/` until their full text is approved for publication.

## Homepage Media and Publications

The hero keeps its current image until `site.hero.media.video` in `src/content/site.ts`
is set to a video URL, for example `/media/hero.mp4`. The video fills the existing
hero and plays muted in a loop; the poster remains visible when reduced motion is enabled.

Publication thumbnails use ordinary image URLs and accept PNG, JPEG, WebP, or animated GIF.
Each author has a full `name`, with optional `equalContribution` and `corresponding`
flags rendered as superscript `*` and dagger markers. Submitted papers are labeled separately
from published work in their venue text.

## Glass and Runtime Checks

Shared glass presets and adjustable properties are documented in
[docs/glass-interface.md](docs/glass-interface.md). All page-level glass uses
`GlassSurface`; the retained upstream library is patched locally under `vendor`.

`npm run check:ui`, `npm run check:video`, and `npm run check:visibility` run
desktop Chrome checks against the running local site. `npm run profile` records
performance against the production preview. See the interface document for
URL arguments, fixture behavior and output locations.

Measured before/after results, reference-source notes and verification limits
are recorded in [docs/runtime-performance.md](docs/runtime-performance.md).
