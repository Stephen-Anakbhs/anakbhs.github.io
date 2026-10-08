# Performance Pass - 2026-10-08

Scope: preserve e44b6b7 visuals, text, layout, optics, motion, quality tiers and
hero behavior. Original media stays unchanged. Only P1 may lose a small amount
of sharpness. Other media needs display-size DPR-2 numerical comparisons.

Baseline: main e44b6b70b07b0239123943172a4b07f205de7a70. Frozen build is
`output/perf-baseline-e44b6b7`, served on port 4181. Measurements are in
`output/performance-pass/baseline/all.json` and adjacent Chrome traces.
Environment: Chrome 1440x900, DPR 2, CPU 4x; network samples add 300 KiB/s and
150 ms latency. Counts below distinguish bytes actually transferred in five
seconds from the total payload of resources requested during that interval.

| Baseline | Home | Publications |
| --- | ---: | ---: |
| First 5 s transferred bytes | 1,278,401 | 1,273,913 |
| Requests initiated in first 5 s | 98 | 63 |
| Heading ink ready (ms) | 14,141 | 13,161 |
| Scroll p95 (ms) | 33.3 | 16.9 |
| Scroll frames >50 ms | 2 | 0 |

Cached publication opening tasks were 36.9-55.0 ms; closing tasks 75.8-129.3 ms.
The three project opening tasks were 57.8/74.8/88.7 ms; closing tasks
140.8/129.0/163.0 ms. Trace attribution points primarily at style invalidation
and paint, rather than proving that React removal alone caused the delays.
Initial opening latency includes Playwright's actionability wait; subsequent
measurements will also use DOM input timestamps to isolate application delay.

## Evidence-Based Cleanup List (Before Deletion)

- Five earlier CSS blocks for `.post-card`, `.post-card-meta`, `.post-card h3`
  and `.post-grid` are unconditionally overwritten later with equal specificity.
  Their blog components are also not currently routed. Remove only the shadowed
  declarations, retaining the final rules. Verify computed styles and screenshot
  matrix, plus site/responsive checks.
- The informational snapshot retry `console.log` uses only numeric local counters;
  no state or retry choice depends on it. Remove only if a forced one-failure
  retry test still succeeds and preserves the error diagnostic. Preserve all
  actual retries, cancellation, warning/error reports and compatibility paths.
- No other runtime deletion is justified yet. Hero/WeChat, Studio and tests are
  excluded from cleanup. These tiny deletions are not claimed as speed gains.

## Status

User authorized an interim deployment on 2026-10-08, explicitly asking to inspect
the current optimized version online and then continue optimization. This changes
the release timing only; the original performance targets remain outstanding.
The 30 ms modal target and complete visual matrix are NOT yet accepted. No claim
of full goal completion is made. Experimental focus/data-state changes are not
part of this release; the original visible-trigger/native-modal ordering remains.

Completed local checks for the interim candidate: typecheck/build, site 12/12,
responsive 30/30 (Chrome/WebKit), Glass Studio 18/18, Chrome mobile autoplay
13/13, hero fallback 4/4 scenarios, lifecycle/readiness 18/18, P1 browser playback
15 cases. Protected optics/hero source and original media are unchanged. No PDFs
are present in the public/build directories. Interim commit 2ae1d3d was deployed
by Actions run 37799409803; build, macOS WebKit autoplay/fallback and deploy all
succeeded. Live HTML matches the local entry names. Through the configured
proxy, the full AVIF downloaded in 2.28 s (1,907,439 bytes); the thumbnail retry
took 20.31 s (1,708,130 bytes) after an earlier timeout. These are single-request
observations, not stable bandwidth estimates.

The full 192-state visual matrix was captured, but comparisons have unresolved
failures. Chrome reported stable glass-region differences around some project
dialogs; WebKit also reported fractional image bounds and hero freeze mismatch.
No visual pass or full-goal completion is claimed.

Post-release user Chrome diagnosis: the same AVIF thumbnail was fully loaded but
appeared stuck while IAB played it. The supplied Chrome GPU status explicitly
showed software-only compositing/rasterization, acceleration disabled and Microsoft
Basic Render Driver. On 2026-10-09 the user confirmed enabling GPU acceleration
made Chrome very smooth. The reported browser-wide stutter is therefore resolved
by that user-observed change; no animation format/visual downgrade is needed for
this symptom. This is not a new agent GPU inspection or a frame-by-frame P1 test,
and does not waive the remaining site-level performance targets.

## Mobile Transparency Hotfix - 2026-10-09

The user's physical iPhone screenshot shows an opaque black P1 rectangle.
The AVIF files still contain animated alpha. Apple reports this decoder defect
in https://bugs.webkit.org/show_bug.cgi?id=275906 and its black-background
duplicate https://bugs.webkit.org/show_bug.cgi?id=305155. Advertising AVIF
support does not establish correct animated transparency.

PublicationList now omits the animated AVIF source for Apple WebKit (including
iOS Chrome/Firefox and desktop-mode iPad), both in the thumbnail and the preview
payload. Those browsers use the existing transparent animated WebP. Chromium,
Android and Firefox retain AVIF with native fallback. The original metadata still
prevents full animation preloading on hover/focus. No media was re-encoded;
150 frames, 40 ms, infinite rotation, glass visuals and fixed row height remain.
Thumbnail centering uses auto margins rather than a fractional transform; 96
earlier bounds checks differed from the original contain geometry by at most
0.015492 CSS px, below the unchanged 0.05 px check.

`output/performance-pass/animation-mobile-alpha-loaded/report.json` passes seven
application profiles: Chrome, mobile WebKit, Firefox, AVIF-capable Chrome with
iPhone Safari or iOS Chrome UA, desktop-mode iPad UA, and Android Chrome UA.
All check selected thumb/full formats, transparent corners and frames, retained
504/300 frame ratio and no full animation request before opening. Four profiles
also verify all four painted models change and continue past the six-second
loop in both thumbnail and lightbox. iOS UA routing is deliberately tested in
an AVIF-capable engine, not just a WebKit build that lacks AVIF decoding.
The first run hit a lazy-image decode/source-change race in the test; it now
waits for the selected image to finish loading before decoding. Existing alpha,
loop and preload assertions were not relaxed. Build and typecheck pass. No PDFs
are present in public or dist. The existing macOS WebKit release job now also
runs this application animation check. Physical iPhone acceptance remains for
the user after deployment; local WebKit is not claimed as that device test.

The broader performance objective is still incomplete. Fresh all-15 cached
modal results are in `output/performance-pass/dialogs-13b30e7-gpu-confirmed`:
input-to-open 32.6-60.9 ms, maximum task during opening 42.222-152.311 ms,
worst opening frame 166.7 ms. The native-video visual harness sampling mismatch
is repaired with matching RGBA area sampling and negative controls, yielding
SSIM 1 and zero changed pixels for one WebKit desktop/lite home state only.
That candidate was an intermediate thumbnail experiment, not this release;
neither that single state nor the repaired mask establishes a full-matrix pass.

Release isolation: Actions 37823655943 did not deploy. Attempt 1 failed the
unchanged landscape hero-poster check. Attempt 2 passed all 13 autoplay cases
but failed the unchanged fallback full-loop timing check (49.741 s for 38.433 s
remaining; median delivery 0 ms). Both failures are retained, not waived.
`codex/mobile-alpha-release` therefore restores ProjectGallery and the Vite
configuration exactly to the public 2ae1d3d versions, keeping the unshipped
project-lens/scrollbar work on `codex/perf-pass` at 2ab80df. Only PublicationList
differs at runtime from the current public release. The new animation check
runs first so older hero failures cannot hide its result; all original checks
still gate deployment. This does not claim the unshipped changes caused the CI
failures, and no hero code or test threshold has been changed.

The user subsequently authorized "only fix video compatibility, effects unchanged".
Native Hero readiness in d948ad3 therefore accepts a real compositor frame even
if WebKit is paused at callback delivery; disposed/error/HAVE_CURRENT_DATA guards
remain. No video, CSS, autoplay/WeChat retry or fallback behavior changes. Added
readiness callback diagnostics to the existing autoplay report without altering
assertions. Chrome autoplay/WeChat 13/13, typecheck and build pass. The focused
`test-hero-readiness.mjs` uses TypeScript AST extraction of the actual observer:
working tree/d948ad3 pass 10/10; pre-fix 01d4453 fails exactly the paused-frame
case (9/10), retaining all invalid-frame and duplicate-scheduling checks. Native
macOS validation and release remain separate from this unit evidence.

Actions 37827490243 then passed Apple animation transparency/looping and all 13
native autoplay/WeChat checks, including landscape reload. The unchanged canvas
fallback test still showed burst delivery (median 0 ms, p95 8 ms) and 38.373 s
for 36.300 s remaining, so deployment was held. Within the user's compatibility
authorization, canvasHeroPlayback now waits on requestAnimationFrame instead of
window timers, retaining absolute media deadlines, all frames, original source,
abort cleanup, decoding and resume behavior. Chrome's four fallback scenarios
and end-of-file resume pass: all 1331 frames through loop start, elapsed 43.519 s
for 43.533 s remaining, median 33.3 ms, p95 33.8 ms. The user's pre-existing
fallback-test diagnostics remain uncommitted; no assertion or limit was changed.
Build/typecheck pass; macOS pacing is still to be verified, not inferred.

## Follow-Up - 2026-10-09

Fresh matching-protocol slow-network measurements (scroll begins six seconds
after navigation), baseline `e44b6b7` versus local `13b30e7`:

| Metric | Baseline home | Current home | Baseline publications | Current publications |
| --- | ---: | ---: | ---: | ---: |
| First 5 s transferred bytes | 1,242,401 | 1,391,015 | 1,285,913 | 1,399,970 |
| First 5 s requests | 98 | 81 | 63 | 58 |
| Heading ink ready (ms) | 13,574 | 2,710 | 13,697 | 2,456 |
| Scroll p95 (ms) | 33.4 | 49.9 | 16.8 | 16.8 |
| Worst scroll frame (ms) | 133.4 | 133.3 | 33.4 | 266.8 |
| Scroll frames >50 ms | 3 | 4 | 0 | 2 |

Evidence: `baseline-final-protocol/network.json` and `candidate-13b30e7/network.json`
under `output/performance-pass`. The old baseline table above used an earlier
scroll-start protocol; these fresh runs are the matching comparison. Under the
fixed bandwidth cap, transferred bytes did not decrease. Home below-fold
publication/logo requests changed from 13 to 0. Hero-related first-five-second
transfer was 322,822 versus 351,322 bytes; hero code/media remains excluded.

Three rejected snapshot experiments tested asynchronous detached-image decode,
decode of already-loaded DOM images, and temporary ImageBitmap preparation. They
preserved the original lazy-image restriction, but did not eliminate main-thread
WebP decode: the publications trace still showed 197.9, 154.4 and 166.8 ms decode
events respectively, versus 162.1 ms before. They were completely reverted; no
speedup or shipped fix is claimed. The decode-only experimental fixture matched
1,024,000 RGBA pixels in each of Chrome/WebKit/Firefox, but that does not satisfy
the performance target or the full-site visual matrix. Current production-preview
build and the restored original five loading checks pass after the reversion.
Experimental traces are kept in `candidate-async-snapshot-decode`,
`candidate-async-all-images`, and `candidate-snapshot-bitmaps`.

The stricter WebKit native-frame proof failed equally for baseline/candidate:
closest independent source frame 60, MAE 15.881510, versus bound 7.756438. The
reference uses FFmpeg area resize, while the native probe uses Canvas high-quality
resize; equivalence is not established. Offline tests point to sampling-path
differences more strongly than a BT.709/601 matrix change, but native probe RGBA
was not saved, so the cause is not yet proven. Preserve both failed reports and
collect original native RGBA before changing the proof. No threshold was relaxed.

- Project lens maps now synchronize to settled sheet dimensions, and to an image
  load that arrives after settling. Optical inputs, spring parameters and CSS are
  unchanged. The old baseline's first open used an early map size; its warmed
  reopen eliminated the large lower-sheet difference. Targeted dev checks covered
  Chrome/WebKit full/lite, first open, reopen and delayed image loading: 4 geometry
  checks and 8 zero-tolerance unmasked image comparisons passed.
- OverlayScrollbars 2.16.0 removed then re-added all viewport overflow tokens on
  every update, including no-ops. A narrowly scoped Vite transform now writes the
  final token set atomically and skips unchanged values. The pinned package and
  styles are retained; dependency prebundling excludes this module so dev and
  production use the same patch. The existing public options cannot suppress this
  internal host-update rewrite. Three unit checks cover all axis combinations,
  repeated state and patch scope; Chrome/WebKit browser checks cover actual handle
  dragging, keyboard scrolling, modal scroll lock, focus and restored scrolling.
- Latest checks: typecheck/build, site 12/12, responsive 30/30, Studio 18/18,
  lifecycle/readiness 18/18 and the new scrollbar checks passed. The first site
  command used an unavailable default fixture port; rerunning with the existing
  5183 fixture server passed without changing assertions. The new scrollbar test
  now waits for the actual lazy-loaded route, and confirms pointerdown hits the
  handle instead of accidentally clicking the track.
- Timing remains incomplete. On Chrome 154.0.8037.99, DPR2, CPU4x, the isolated
  atomic-update experiment removed the second document-wide style pass. Its three
  close tasks were 119.2/89.5/126.9 ms versus control 131.9/126.7/176.2 ms. The
  rebuilt candidate still measured open tasks 63.5/89.9/107.7 ms and over-50-ms
  frames. These samples do not establish the required 30/50-ms pass or a stable
  overall speedup. Traces: `output/performance-pass/e-quiet-control`,
  `e-atomic-overflow`, and `e-atomic-built`. A persistent-lightbox-DOM experiment
  showed no demonstrated benefit and was reverted.
- The Windows WebKit visual harness previously accepted transparent video pixels
  while the media clock advanced, so some screenshots were the poster. A bounded
  native pause/resume plus actual pixel checks recovered both baseline/candidate
  desktop-lite home captures. Independent source-frame comparison identified frame
  60; all 5,184,000 baseline/candidate screenshot pixels matched exactly. This is
  one verified state, not a replacement for rerunning the full 192-state matrix.

The follow-up changes are local and not a second deployment. The public release
remains 2ae1d3d. The user's Chrome acceleration/animation retest is still pending.

## Media Candidate

Original media and all publication text/links are retained. Static figures have
responsive lossless WebP derivatives; full images have a maximum edge of 2559 px.
The source aspect ratio determines the painted rectangle, independently of
integer rounding in derivative dimensions. TOG and P4 use their larger thumbnail
variant because the smaller variant showed greater rasterization differences.

Native Chrome DPR-2 content SSIM on white/light/dark backgrounds is below. These
are measurements, not user acceptance. The numerical 0.995 heuristic in the new
visual harness is not a user-specified threshold; its failures remain recorded
alongside actual image pairs for visual inspection.

| Figure | Selected thumbnail minimum SSIM | Full minimum SSIM |
| --- | ---: | ---: |
| TOG | 0.993258 | 0.993003 |
| BBA | 0.985916 | 0.995678 |
| GF | 0.974033 | 0.982228 |
| MC | 0.958606 | 0.989407 |
| RSC | 0.958716 | 0.988112 |
| P2 | 0.989215 | 1.000000 |
| P3 | 0.995684 | 1.000000 |
| P4 | 0.989224 | 1.000000 |
| P5 | 0.989288 | 1.000000 |
| P6 | 0.958552 | 0.991377 |
| P7 | 0.967729 | 0.986769 |

P1 retains 150 frames, 40 ms/frame, a six-second loop, four synchronized models
and alpha. Only the thumbnail loads before opening the lightbox.

| P1 resource | Bytes | Difference from original 7,346,780 bytes |
| --- | ---: | ---: |
| AVIF thumbnail, 720 x 275 | 1,708,130 | -76.75% |
| AVIF full, 1440 x 550 | 1,907,439 | -74.04% |
| WebP fallback thumbnail | 1,992,966 | -72.87% |
| WebP fallback full | 4,035,762 | -45.07% |

Budget deviation: the AVIF thumbnail exceeds 1 MB. The 950,357-byte candidate
left alpha=1 at a transparent corner; the selected alpha-32 encode keeps every
border pixel fully transparent across all 150 frames. The full AVIF meets 2 MB.
WebP fallback also exceeds the requested budgets; its chosen sizes retain the
animation timing and acceptable point-cloud detail instead of dropping frames.
Originals are untouched. Exact encoding metadata and sampled pixel evidence:
`output/media-derivative-review/p1-final.json` and `static-final-mapping.csv`.
