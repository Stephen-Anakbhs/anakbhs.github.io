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

Post-release user Chrome diagnosis: the same AVIF thumbnail is fully loaded but
appears stuck while IAB plays it. The supplied Chrome GPU status explicitly shows
software-only compositing/rasterization and hardware acceleration disabled, with
Microsoft Basic Render Driver. User was asked to enable graphics acceleration
and relaunch. The animation still requires rechecking after that change; this
does not waive the remaining site-level performance targets.

## Follow-Up - 2026-10-09

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
