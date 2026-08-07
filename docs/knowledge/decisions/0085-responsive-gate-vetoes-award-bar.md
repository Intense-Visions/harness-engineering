---
number: 0085
title: A mechanical responsive gate vetoes the award-bar verdict
date: 2026-08-07
status: accepted
tier: medium
source: docs/changes/design-craft-responsive-gate/proposal.md (Decisions D1–D4)
---

## Context

The award-bar verdict (ADR 0084) certifies desktop aesthetic clearance only —
its five radar dimensions are aesthetic and judge no mobile/responsive
behavior. A consuming-side audit (the `iv-demo` fleet) found ~10 of 14 demos
with award-tier-fatal mobile defects — a nav that `display:none`s to nothing
with no hamburger (unreachable on a phone), 21–75px of horizontal overflow —
and every one would clear all five aesthetic dimensions. So `awardBar: cleared`
could certify a phone-broken page. ADR 0084 named a `responsive` axis as a
future increment; this ADR resolves how it lands.

## Decision

Add a **mechanical responsive gate** that composes onto the award-bar verdict.
It is NOT a sixth LLM radar dimension.

1. **Rendered viewport probe, not a static heuristic or an LLM axis.** The
   defects are layout facts (`scrollWidth`, element visibility) that only a
   render reveals; a probe gives honest pass/fail. A static code heuristic can
   only guess, and an LLM axis would need mobile-calibrated exemplar references
   we do not have — fabricating a bar, violating ADR 0084 D2.
2. **The probe lives in a shared floor module (`src/responsive/`); the
   award-bar consumes it.** Mechanical detection belongs with `src/drift`,
   `src/brand`, `src/audit` — not inside design-craft's pure-judgment layer.
   `applyResponsiveGate` (design-craft) folds the gate result into the verdict;
   `computeAwardBar` (aesthetic) is untouched.
3. **Portable render source: a caller-supplied `ResponsiveMetrics` manifest**
   (mirroring the deep-mode `captureCommand`). The CLI ships no browser;
   callers or the Playwright MCP emit per-target layout metrics as JSON. A
   screenshot is insufficient — the gate needs `scrollWidth` / nav-visibility.
4. **Honest `not-evaluated` default; opt-in strictness.** No metrics →
   `not-evaluated`, aesthetic verdict stands (no regression). `require: true`
   downgrades a would-be `cleared` to `indeterminate` when mobile was not
   evaluated. A `defective` gate always forces `not-cleared` and outranks an
   aesthetic `indeterminate` (a proven defect beats aesthetic uncertainty).

Seed defects: `horizontal-overflow` (`scrollWidth − viewportWidth >
overflowTolerancePx`) and `unreachable-nav` (no visible nav AND no visible menu
toggle). Config: `design.craft.benchmark.awardBar.responsive`
(`require` false / `viewport` 390 / `overflowTolerancePx` 1).

## Consequences

- `awardBar: cleared` can no longer certify a page with a detected mobile
  defect. What `cleared` means now depends on `responsive.status`: `clean` =
  desktop aesthetic AND mobile-clean; `not-evaluated` = desktop aesthetic only
  (mobile unchecked — the scope docs still apply).
- The mechanical probe is reusable by accessibility/other skills, not welded to
  the award-bar.
- Additive: `computeAwardBar` and its tests are unchanged; the gate composes
  after.
- Seed defect kinds are the two the audit surfaced. Tap-target size, contrast,
  and multi-viewport sweeps are additive later — the manifest + gate shape
  accommodate them without a schema break.
- When CRAFT_SCORE graph nodes land, `responsive.status` + defect kinds should
  be queryable alongside `awardBar.verdict`.
