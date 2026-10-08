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

Baseline captured. Candidate implementation and all final acceptance checks are
in progress; no performance success or public deployment is claimed yet.
