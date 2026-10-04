# Desktop runtime verification

## Current simplified interface, 2026-10-04

The user's latest correction removes backdrop-sampling foreground changes and
hover lift/enlargement. Home navigation has a fixed white foreground; content
navigation and action buttons use fixed dark ink. Project captions have authored
tones, not runtime sampling. The chosen light-gray stone wallpaper is restored.
Blog articles, navigation and active routes are removed; reusable components and
CSS remain in source. The footer is a single name/year/copyright line.

OverlayScrollbars now uses its existing scroll auto-hide mode: 1000ms idle delay,
300ms opacity transition, 6px visible handle and 18px interaction track. Dragging
and visible keyboard focus retain the scrollbar. No additional polling was added.

Typecheck and production build passed. The existing lazy 3D chunk warning remains.
`output/playwright/refined-1024.json` and `refined-1920.json` passed on production
preview at port 4173, with no page errors. Checks cover stable colors, stationary
hover, press response, reversible menus, retained renderer/optical settings,
project dialogs, Home video return, scrollbar fade/drag/keyboard, the selected
wallpaper, copyright footer, and retired Blog index/three article URLs.
`refined-1440.json` records the earlier development check in this same revision,
before the bus caption was fixed to white. Production screenshots include that
final caption correction. No public deployment was performed.

No new FPS benchmark was run for this refinement. All performance numbers and
adaptive-color descriptions below belong to the historical revisions indicated.

## Earlier clear navigation, 2026-10-04

The later authorized changes retain liquid-gl's real refraction, but remove
shader frost/chromatic fringes, unify the shell's 0.5px blur, retain the menu
renderer through reversible open/close animations, and use event-driven rendering.
Text and icons share backdrop-adaptive contrast. A silver crystal-strata crop
replaces the ocean; the full-page white veil is gone. Headings, content, project
count and the original video are unchanged.

Current evidence: `output/playwright/clear-demand.json`, headed Chrome
154.0.8037.93, 1440x900, DPR 1, development server. No manual inputs occurred
during any measured sample. The immediate preceding development build is
`output/playwright/restored-navigation.json`, inspected for this comparison.

| Sample | Current FPS | P95 | Earlier / current app RAF callbacks |
| --- | ---: | ---: | ---: |
| Home idle, 4 seconds | 60.08 | 16.8 ms | 482 / 120 |
| Scroll 2800px, 5 seconds | 57.81 | 16.8 ms | 1227 / 927 |
| Publications idle, 4 seconds | 60.09 | 16.8 ms | 484 / 3 |

This is an overhead reduction, not an increase in display refresh rate. The
first-scroll sample still has one 116.7ms frame; the preceding build had a
116.6ms frame. Do not claim the page is entirely free of hitches. All three
measured Home returns resume playback at approximately 60 display FPS. Some
startup/transition video frames were dropped; no source re-encoding was used.
The video source remains 1920x1080. Video-frame-driven glass refresh is separate
from browser display-frame timing.

One canvas and a 1224x7559 snapshot remain. Resolution increased from 0.65 to
0.85 to preserve backdrop detail. No new per-image canvas renderer was added.
The small shared contrast sampler runs on relevant changes, not as an idle loop.
These desktop-host results do not establish performance for every browser/device.

`scripts/verify-clear-glass.mjs` records real intermediate menu frames, rapid
reversals, keyboard focus, same-renderer retention, white/dark backdrop contrast,
matching icons, project dialogs and Home returns. `scripts/verify-site.mjs`
also exercises routes/history, reduced-motion changes, 1024/1280/1920 layouts
and the independently adjustable/refraction-rendered glass fixture.

Final checks for this revision:

- TypeScript check and production build passed. The existing lazy 3D fallback
  still emits a large-chunk warning; this video homepage does not import it.
- `clear-1024.json` and `clear-1920.json` exercise the production preview at
  port 4173; `clear-1440.json` records the development page. Production checks
  additionally assert control hover/press, both intermediate menu transitions,
  the crystal wallpaper and absence of the global veil. All have no page errors.
- `output/verification/video-recovery.json` records two aborted media requests,
  a real media error code 4 and decoded frames after returning Home. A separate
  injected AbortError on play is retried successfully. The test holds the outage
  until the error is observed because a single failed range request can recover
  before polling sees it; an earlier single-request injection timed out.
- The ordinary-browser visibility test confirms hidden/paused state, resumed
  foreground playback and pageshow recovery.
- ffprobe confirms the unchanged source is 1920x1080, 30fps, 44.333333 seconds,
  11,713,800 bytes. No public deployment was performed.

The sections below are historical, not descriptions of the current rendering path.

## Earlier navigation restoration, 2026-10-04

The user rejected the navigation appearance change. The original liquid-gl
3.0.0 selection shader, refraction/bevel settings and fluid interaction have
been restored from `output/performance/before/src/components/layout/LiquidNavigation.tsx`.
Extra rim spans on the navigation shell and menu button are hidden again.
The fixed backdrop readability fix, other controls' single-pass optics,
offscreen gating and Hero video recovery remain in place.

`output/playwright/restored-navigation.json` measures the restored development
build at 1440x900: scroll 58.25 FPS, Home idle 60.08 FPS, publications idle
60.09 FPS, scroll P95 16.8 ms, with all three Home returns playing. One initial
scroll frame reached 116.6 ms. The shader uses one renderer and its original
936x5780 snapshot; idle callbacks are therefore no longer zero (482-484 per
4-second sample). Do not apply the previous no-canvas/no-callback claims to
this restored navigation. The measurements below describe the preceding
optimization build, not the restored navigation.

## Earlier optimization build

Verified locally on 2026-10-04. No commit or public deployment was performed.
The ocean background, content, three projects, photographs, original hero
video, white glass foreground, layout and navigation spring were retained.

## Changes

The old navigation captured the entire document through liquid-gl while other
controls used liquid-glass-react. A 936x5780 snapshot texture and continuous
render callbacks remained active even when reading a stationary page.
The snapshot renderer and its dependency are removed. All component materials
now use the existing liquid-glass-react engine through `GlassSurface`.

GPU isolation also identified the multi-channel displacement pipeline as a
scroll bottleneck. The local vendor patch uses one genuine displacement pass
when `aberrationIntensity` is zero. Nonzero values retain the upstream RGB
pipeline. This is not a flat CSS replacement: distortion, frosting and rims
remain, including the visual checkerboard test in `output/verification`.

Offscreen surfaces stop optical painting through a shared IntersectionObserver;
resize observers ignore unchanged sizes. Default rigid surfaces do not update
React state on every pointer movement. Navigation still selects immediately
while page scrolling and the existing spring run concurrently.

Desktop navigation now owns its fixed backdrop layers instead of nesting them
inside a fixed wrapper. This fixes sharp page headings showing through menu
labels in Chrome. The original edge offsets, pill/circle sizes, foreground and
spring are retained. No opaque dark navigation fill was added.

The hero no longer permanently unmounts after a transient media failure. It
retains the poster and can reload on re-entry, retry an interrupted play
promise, pause offscreen/in a hidden tab, and resume on return. Reduced-motion
changes are now observed dynamically, including switching back to playback.

## Measurements

Setup: headed Chrome 154.0.8037.93, viewport height 900, DPR 1, on the Windows
host reporting NVIDIA GeForce RTX 5090 and AMD Radeon graphics. The profiling
driver samples browser animation-frame timing; this is not a guarantee about
every display, browser, device or network. Each browser was run separately.

Historical baseline from `output/playwright/before.json`, at 1440x900 on the
old **development server**:

| Sample | FPS | P95 interval | Application RAF callbacks |
| --- | ---: | ---: | ---: |
| Home idle, 4 seconds | 60.10 | 16.8 ms | 723 |
| Scroll 2800px, 5 seconds | 44.53 | 49.9 ms | 1164 |
| Publications idle, 4 seconds | 28.35 | 50.0 ms | 344 |

Final **production preview** (`http://127.0.0.1:4173/`):

| Viewport | Home idle FPS | Scroll FPS | Publications idle FPS | Scroll P95 |
| --- | ---: | ---: | ---: | ---: |
| 1024x900 | 60.15 | 58.78 | 60.12 | 16.8 ms |
| 1440x900 | 60.16 | 58.74 | 60.07 | 16.8 ms |
| 1920x900 | 60.01 | 58.41 | 60.09 | 16.8 ms |

The baseline and final builds use different server modes; do not interpret
their ratio as a controlled, single-variable benchmark. The earlier isolation
reports separately identify snapshot rendering and multi-pass displacement.
Final reports are `output/playwright/production-{1024,1440,1920}.json`.
Interrupted or manually displaced sampling runs were not used in this table.
The retained final samples record no pointer/key/wheel input during capture.

In all final sizes, Home idle has zero application RAF callbacks per 4 seconds;
publications idle has two. All nine measured returns to Home resume video.
The DOM element count stays at 1445 throughout these samples; there is no
whole-page canvas or liquid-gl texture. This short run is not a long-duration
memory-leak proof. The 1440px sampled JS heap is approximately 5.5-5.9 MiB.

First-scroll samples still include one isolated 83-100ms frame per run. These
results resolve the sustained low frame rate, not a promise of zero long
frames. Video decoding can report dropped startup/transition frames; no
source resolution or frame-rate reduction was used to achieve the result.

## Checks

- `npm run typecheck`: passed.
- `npm run build`: passed; the existing lazy 3D fallback remains a large chunk.
- `npm run check:ui -- http://127.0.0.1:4173 http://127.0.0.1:5173` checks the
  production page and the isolated dev-only glass fixture: section anchors,
  immediate selection, repeated Home returns, hover/dialogs, browser history,
  reduced-motion switching, menu reopening, desktop overflow, white icon/text
  consistency, glass configuration, real refraction and live resizing.
- `npm run check:video -- http://127.0.0.1:4173`: failed media request recovers
  on Home entry (27 decoded frames), interrupted play retries (28 frames).
- `npm run check:visibility -- http://127.0.0.1:4173`: ordinary isolated Chrome
  actually pauses in a hidden tab, then advances from 0.028 to 0.757 seconds
  after activation. A separate synthetic pageshow test covers the handler;
  actual browser back-forward-cache restoration is not claimed.
- Screenshot review: project frosting, white text/icons, publication media
  rims, navigation over headings, and a genuinely distorted checkerboard.

`ffprobe` confirms the unchanged media is H.264, 1920x1080, 30/1 fps,
44.333333 seconds and 11,713,800 bytes. Loop, muted playback, cover poster and
the absence of a pause control are verified. The standard video route did
not download `HeroScene` or a liquid-gl renderer chunk. The 880.15kB lazy
fallback build warning does not represent a video-homepage download.

## References inspected

Reference source files are kept outside the runtime in
`output/performance/references/`:

- Jon Barron's homepage HTML and stylesheet: https://jonbarron.info/ . The
  inspected example uses a native muted/autoplay/loop video and an image, with
  small hover handlers changing opacity. This supports native media and
  local interactions; its hidden-video behavior was not copied blindly.
- al-folio README and actual `_pages/about.md` template:
  https://github.com/alshedivat/al-folio . Profile, selected publications, news
  and latest posts are configuration-driven. That separation supports the
  existing content/preset architecture without replacing the site's design
  or migrating to Jekyll. Only relevant source files, not a full theme/media
  archive, are retained.
- Existing optics library: https://github.com/rdev/liquid-glass-react . MIT
  attribution is retained under `vendor/liquid-glass-react/LICENSE`, with
  local modifications documented alongside it. The upstream displacement
  support in Safari/Firefox is partial; desktop Chrome was the target here.

The reusable API and all visual settings are in [glass-interface.md](glass-interface.md).
Visual acceptance on the user's devices and any public hosting/network checks
remain distinct from these local implementation tests. Mobile was not redesigned.

## Autoplay-denial recovery (2026-10-04)

The later mobile work supersedes the historical mobile scope above. Native
muted inline playback is still the first choice. A rejected `play()` promise
or four seconds without advancing video time replaces the native player with
`AnimatedHeroFallback`; a rejected player is not left over the background.
The fallback lazily decodes the same H.264 file with WebCodecs/Mediabunny and
draws it on a canvas. Hosts without VideoDecoder first try WebKit's MP4-as-image
support. The navigation
uses that image/canvas in its existing live-refraction path. The material,
wallpaper, typography and navigation geometry are unchanged by this patch.

No GIF conversion is shipped. Ordinary GIF uses a 256-entry color table and
cannot preserve this video's full-color decoded frames. Both implemented
dynamic paths reuse the original 1920x1080, 30 fps, 44.333333-second MP4 without
rescaling, re-encoding, shortening the loop or intentionally removing frames.
Canvas drawing follows source timestamps; actual delivery speed still depends
on the device. Offscreen/hidden playback is stopped, and reduced-motion mode
retains the static poster. A host with neither working image-video nor video
decoding also keeps the poster; universal animation is not claimed.

Current Windows Chrome production-preview checks (`http://127.0.0.1:4173`):

- Typecheck and production build pass. The decoder is a separate lazy chunk.
- `verify-mobile-autoplay.mjs`: seven checks pass, covering 320px/390px portrait,
  landscape, fresh entry/reload, delayed media and offscreen return.
- `verify-hero-fallback.mjs`: denial, pending promise, resolved-but-stalled
  playback and unavailable image-video all animate before trusted input or
  user activation. No native hero player remains. Glass updates and offscreen
  return also pass.
- The full-loop canvas check draws all 1,330 original frames before frame 1,331
  starts loop two. From source time 2.0s to that boundary takes 42.319s; observed
  median frame spacing is 33.3ms and p95 is 34.0ms on this host.
- `verify-responsive-assets.mjs`: compact-menu pixel checks, breakpoint
  roundtrips, six corrected publication mappings/lightboxes, TOG review status,
  transparent logos and supplied-figure byte identity pass.

These results do not establish physical iPhone/low-power-mode acceptance.
The existing macOS WebKit deployment check now also runs the fallback suite;
its actual result must be inspected before claiming WebKit coverage. The first
macOS fallback run found timeline slowdown and prevented deployment. The
follow-up scheduler no longer adds an extra display-refresh wait to an already
late frame, and capable hosts skip the unnecessary image-video startup probe.

Primary references:
- https://webkit.org/blog/6784/new-video-policies-for-ios/
- https://webkit.org/blog/8216/new-webkit-features-in-safari-11-1/
- https://developer.chrome.com/blog/autoplay/
- https://www.w3.org/2025/Talks/TPAC/PNG-summary/

The mainland network check is `scripts/check-mainland-access.ps1`; its local
report is `output/verification/mainland-access.json`. It probes HTTP/HTTPS,
publications, the deployed entry script, a local font and a video byte range
through Telecom/Unicom/Mobile. An earlier deployment had passing Telecom and
Unicom probes but intermittent Mobile TCP/TLS timeouts. That is not evidence of
nationwide blocking or nationwide reliable access. A frontend playback fix
does not repair an upstream TCP/TLS route; recheck the published version and
keep network/hosting conclusions separate from browser tests.
