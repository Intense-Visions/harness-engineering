---
'@harness-engineering/cli': minor
---

Add a mechanical responsive gate that vetoes the design-craft award-bar
verdict when a target carries mobile defects. Every `BenchmarkScore.awardBar`
now carries `responsive: { status: 'clean' | 'defective' | 'not-evaluated';
viewport?; defects[] }`, computed by a new floor-layer module
(`src/responsive/`) from per-target rendered layout metrics — not a sixth
aesthetic radar dimension. A `defective` gate (a `horizontal-overflow` or an
`unreachable-nav` — no visible nav and no menu toggle) forces `not-cleared`
regardless of the aesthetic score, so `cleared` can no longer certify a
phone-broken page. Layout metrics are supplied via `responsiveMetrics` (e.g. a
Playwright MCP run) or a `responsiveProbeCommand` that prints a
`ResponsiveMetrics[]` manifest (the CLI ships no browser). With no metrics the
gate is `not-evaluated` and the aesthetic verdict is unchanged; set
`design.craft.benchmark.awardBar.responsive.require` to force `indeterminate`
instead of a mobile-blind `cleared`. Thresholds
(`viewport` 390 / `overflowTolerancePx` 1) are configurable. The aesthetic
`computeAwardBar` path and its behavior are unchanged.
