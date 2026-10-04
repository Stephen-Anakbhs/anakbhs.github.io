# Glass interface

Page components use `GlassSurface` from `src/components/ui/GlassSurface.tsx`.
The optical engine is the existing MIT-licensed `liquid-glass-react` 1.1.1,
with the local changes documented in `vendor/liquid-glass-react/README.md`.
Do not import the engine directly or edit `node_modules`.

Navigation uses the original `liquid-gl` 3.0.0 shader and fluid interaction,
with the subsequently authorized clear-material adjustments. Its local MIT
copy is in `vendor/liquid-gl`; this is not a generic `selection` substitute.
Both Home and body use 0.5px shell blur, zero shader frost and zero chromatic
aberration. Refraction is 0.012, bevel depth 0.01, bevel width 0.055, magnification
1.035 and fluid strength 0.22. Decorative double rims remain hidden.
One retained navigation renderer serves opening, closing and section changes;
it sleeps after the closing transition and wakes for actual interaction.

```tsx
import { FileText } from 'lucide-react';
import { GlassSurface } from './components/ui/GlassSurface';

<GlassSurface material="control" cornerRadius={24}>
  <a className="glass-action" href="/papers/example.pdf">
    <FileText size={20} aria-hidden="true" />
    Paper
  </a>
</GlassSurface>
```

Use a real button or link inside the surface for keyboard and screen-reader
semantics. `glass-action` applies the same `--glass-ink` to the text and icon;
the foreground is fixed by its authored tone, with the same treatment for
both. Avoid assigning separate icon opacity or color. The surface itself
is a layout wrapper, not a replacement for a button.

## Presets and precedence

`src/content/appearance.ts` owns all visual defaults. Values resolve in this
order: global `glassAppearance`, material `glassPresets`, tone adjustment,
explicit component props. An omitted prop does not erase a preset value.

Materials: `control`, `navigation`, `selection`, `overlay`, `logo`, `media`.
`tone="dark"` selects a fixed white foreground; it does not paint a dark
button or change navigation transparency. Controls use 1.5px blur, media/logo
frames 0.5px, and project introductions 7px for local readability. `media`
reserves 12px of frame padding. Explicit `ink` overrides the tone's foreground.

Backdrop sampling was removed at the user's request. Home navigation is white;
content navigation, publication buttons and social icons are dark neutral. Only
crossing the Home/content boundary changes the navigation tone. Project captions
are authored once: white for the bus photo, dark for the two white-background
robot images. Scrolling and changing video frames never recolor individual items.

Control hover changes only the subtle highlight, with no lift or enlargement.
The restrained press response and navigation opening/closing spring remain.
The scrollbar is 6px wide visually, with an 18px interaction track; the existing
OverlayScrollbars auto-hide waits 1000ms then fades over 300ms. Dragging and visible
keyboard focus keep it accessible. Reduced-motion users have no fade transition.

## Background

The fixed wallpaper is `public/media/cold-stone.webp`, the light-gray stone from
the user's second reference screenshot. It is restored from `output/cold-stone.webp`
with the same clockwise rotation and 2560px output width as the earlier trial.
The original photo is Scott Webb's Unsplash image, recorded as the cold-gray
stone candidate in `docs/background-candidates.js`.
There is no full-page white veil. Headings remain ordinary text, and the existing
Home video shade is unchanged. The silver-strata asset is no longer selected.

## Publication scope

The three generated Blog Markdown articles are deleted. Home no longer renders
the Blog section, navigation has four entries, and Blog routes use the existing
not-found page. Blog components, Markdown loader and CSS are retained in source
only; they are not imported into the live application. The footer contains only
`Renjun Gao`, the current year, and `All rights reserved.`

| Property | Meaning |
| --- | --- |
| `blurPx` | Backdrop blur in CSS pixels; foreground children stay sharp. |
| `saturation` | Backdrop saturation percentage; 100 is unchanged. |
| `displacementScale` | Refraction strength; 0 disables displacement. |
| `aberrationIntensity` | 0 uses one displacement pass; nonzero restores upstream RGB dispersion. |
| `elasticity` | Pointer-driven deformation; 0 avoids per-mousemove state updates. |
| `cornerRadius` | Radius in CSS pixels, shared by fill, optics and rim. |
| `mode` | `standard`, `polar`, `prominent`, or upstream `shader` map. |
| `overLight` | Optional additional contrast layer for very bright content. |
| `fill` | CSS background color, including alpha. |
| `ink` | Shared CSS foreground color. |
| `hoverFill` | Background color applied by `.glass-action:hover` and `:active`. |
| `highlightOpacity` | Strength of the retained rim highlights. |
| `shadow` | CSS box-shadow. |
| `padding` | CSS padding string. |
| `enabled` | False renders ordinary children without optical machinery. |
| `mouseContainer` | Optional element ref defining the pointer interaction area. |
| `globalMousePos`, `mouseOffset` | Optional external pointer coordinates. |
| `className`, `style`, HTML attributes | Layout, identifiers, event handlers and accessibility metadata. |

## Performance and integration

The default uses real displacement, blur and highlights, not a flat translucent
substitute. RGB dispersion is opt-in because its three-channel filter was a
measured scroll bottleneck. An explicit nonzero value is honored, not silently
reduced. Large overlapping surfaces with dispersion should be profiled.

One shared IntersectionObserver disables optical painting outside the viewport
plus an 80px margin. It does not continuously capture the document or recreate
the entire engine on each scroll. The vendor ResizeObserver updates only when
the component's dimensions change. Navigation keeps its existing spring.

The navigation opts into the vendor's `frameloop: "demand"`. Scroll events,
spring updates, short pointer/transition windows and video frame callbacks wake
the unchanged shader. Neither a continuous scroll-check RAF nor static-reading
render loop is needed. Menu closing retains DOM/focus semantics through `inert`
and delayed visibility; reversing the transition does not recreate the renderer.

`@liquid-dom/react@0.1.1` is installed. Its DOM-backed `Html` capture requires
experimental HTML-in-Canvas in addition to WebGPU. The normal Chrome tested here
has WebGPU but not `CanvasRenderingContext2D.drawElementImage`. Therefore it is
not imported into the public page's rendering path, and installation must not
be described as completed renderer integration. Upstream requirement:
https://github.com/AndrewPrifer/liquid-dom#browser-and-runtime-requirements

Do not put permanent identity transforms on a frosted surface's ancestors:
they can change Chrome's backdrop compositing. The project hover transition
ends at `transform: none`. Site styles include reduced-transparency,
high-contrast and forced-color behavior. Other browsers can render frosting
without Chrome's full displacement effect; this task's visual/performance
verification targets desktop Chrome.

On desktop, the navigation and menu surfaces own their fixed backdrop layers.
Chrome did not frost page text through the old fixed wrapper's nested surface.
The outer surface applies the preset's blur/saturation once; the library's
inner zero-blur capture retains its displacement and rim, while navigation
labels remain sharp. `global.css` keeps the existing edge offsets and radii.

## Verification

With the dev server running, `npm run check:ui` exercises the actual site and
`tests/browser/glass.html`. The fixture is test-only and is not a production
entry point. For the built site, use
`npm run check:ui -- http://127.0.0.1:4173 http://127.0.0.1:5173`;
only the isolated parameter fixture is loaded from the dev server.

`npm run check:video -- http://127.0.0.1:4173` injects a real failed media
request and an interrupted play promise. `npm run check:visibility --
http://127.0.0.1:4173` launches a separate ordinary Chrome profile, switches
real tabs and removes that test profile afterwards. `CHROME_PATH` overrides
the Windows default Chrome executable location. The `pageshow` handler is
also tested with a synthetic persisted event; this is not proof of a real
browser back-forward-cache restoration.

`npm run profile -- production-1440 http://127.0.0.1:4173/ 1440` captures
frame timings, idle callbacks, video state, DOM counters and resources. The
final argument is desktop viewport width; height is 900 and DPR is 1.
Run one profiling browser at a time. Reports and screenshots are in `output/`.
