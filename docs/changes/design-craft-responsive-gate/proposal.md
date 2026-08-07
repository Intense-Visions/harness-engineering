# Responsive Gate for `awardBar` — a mechanical mobile-defect veto on the award-tier verdict

**Keywords:** design-craft, award-bar, responsive, mobile, viewport, mechanical-gate, layout-metrics, veto

## Overview and goals

The award-bar verdict shipped in #1142 (ADR 0084) certifies **desktop aesthetic clearance** only — its five radar dimensions are aesthetic and capture no responsive/mobile behavior. Consuming-side evidence (the `iv-demo` fleet audit) found ~10 of 14 demos with award-tier-fatal mobile defects — a nav that `display:none`s to nothing with no hamburger (unreachable on a phone), 21–75px of horizontal overflow — and **every one would clear all five aesthetic dimensions**. We closed the honesty gap with docs (scope boundary), but `awardBar: cleared` can still certify a phone-broken page.

**Goal:** add a **mechanical responsive gate** that can veto `cleared` when a target carries detectable mobile defects, so `awardBar` stops over-promising — without fabricating an aesthetic axis.

**Non-goals (YAGNI):** no 6th LLM radar dimension (rejected in brainstorming — it needs mobile exemplar refs we don't have, and the LLM can't judge rendered overflow from code); no bundled browser in the CLI (stays portable); no tap-target/contrast/orientation checks in v1 (seed the two defect kinds the audit actually surfaced; more are additive later); no multi-viewport sweep in v1 (one configurable mobile width).

**Strategy grounding:** advances **Ceiling-raising via LLM judgment** and the harness's honesty ethos — a machine gate whose authority is in TypeScript, composed with the LLM verdict so `cleared` means what it says (`STRATEGY.md#tracks`).

## Decisions made (brainstorming)

- **D1 — Rendered viewport probe, not a static heuristic or an LLM axis.** The cited defects (overflow px, unreachable nav) are _layout facts_ that only manifest when rendered narrow; a probe gives honest pass/fail. A static code/CSS heuristic can only guess; an LLM axis fabricates a bar (D2 of ADR 0084). _(Human decision.)_
- **D2 — Mechanical probe lives in a shared floor module (`src/responsive/`); `awardBar` consumes its result.** Keeps design-craft's judgment layer pure (mechanical detection belongs with `src/drift`, `src/brand`, `src/audit`) and makes the probe reusable by accessibility/other skills. _(Human decision.)_
- **D3 — Portable render source: a caller-supplied layout-metrics manifest** (analogous to the existing deep-mode `captureCommand`). The CLI ships no browser; callers (or the Playwright MCP, when available) produce per-target metrics as JSON. A screenshot is insufficient — the gate needs `scrollWidth` / nav-visibility, not pixels. _(Derived from D1 + the browserless posture.)_
- **D4 — Honest "not-evaluated" default; opt-in strictness.** When no metrics manifest is supplied, the gate is `not-evaluated` and the aesthetic verdict stands unchanged (no regression to existing fast-mode runs) — the desktop-aesthetic scope docs already prevent over-reading. A config knob `require` (default `false`) upgrades `not-evaluated` → `indeterminate` for projects that want mobile mandatory.

## Technical design

### New module `packages/cli/src/responsive/` (mechanical, no LLM)

```ts
// probe.ts
export type ResponsiveDefectKind = 'horizontal-overflow' | 'unreachable-nav';

export interface ResponsiveDefect {
  kind: ResponsiveDefectKind;
  detail: string; // e.g. "content overflows 47px at 390px width"
  viewport: number; // width the defect was observed at
}

export type ResponsiveStatus = 'clean' | 'defective' | 'not-evaluated';

export interface ResponsiveGateResult {
  status: ResponsiveStatus;
  viewport?: number; // width evaluated (absent when not-evaluated)
  defects: ResponsiveDefect[];
}

/** One target's rendered layout metrics — the manifest entry callers/Playwright emit. */
export interface ResponsiveMetrics {
  file: string;
  viewport: number;
  documentScrollWidth: number; // px
  viewportWidth: number; // px (== viewport, echoed for clarity)
  primaryNavVisible: boolean; // a primary nav is visibly rendered
  menuToggleVisible: boolean; // a visible menu/hamburger control exists
}

export interface ResponsiveGateConfig {
  viewport: number; // default 390
  overflowTolerancePx: number; // default 1 (sub-pixel rounding)
}

export function computeResponsiveGate(
  metrics: ResponsiveMetrics | undefined,
  config: ResponsiveGateConfig
): ResponsiveGateResult;
```

Rules (pure, authority-in-TS):

1. `metrics === undefined` → `{ status: 'not-evaluated', defects: [] }`.
2. `overflowPx = max(0, documentScrollWidth − viewportWidth)`; if `overflowPx > overflowTolerancePx` → a `horizontal-overflow` defect.
3. `!primaryNavVisible && !menuToggleVisible` → an `unreachable-nav` defect (primary navigation is not reachable on this width).
4. `status = defects.length > 0 ? 'defective' : 'clean'`.

### Composition into `awardBar` (`design-craft/findings/schema.ts` + `phases/award-bar.ts`)

`AwardBar` gains a `responsive: ResponsiveGateResult` field. The aesthetic computation (`computeAwardBar`) is **unchanged**; a new, small post-step composes the gate so the just-shipped logic and tests are untouched:

```ts
export function applyResponsiveGate(
  aesthetic: AwardBar,
  responsive: ResponsiveGateResult,
  opts: { require: boolean }
): AwardBar;
```

Final verdict rule:

- `responsive.status === 'defective'` → verdict `not-cleared`, `reason: 'responsive-defects'` (award-tier-fatal, overrides an aesthetic `cleared`). Never `cleared`.
- `responsive.status === 'not-evaluated'` **and** `opts.require` → verdict `indeterminate`, `reason: 'responsive-not-evaluated'`.
- otherwise the aesthetic verdict stands; `responsive` is attached for legibility.

Precedence with the existing confidence gate: an aesthetic `indeterminate` (low confidence) is preserved unless responsive is `defective` (a proven defect outranks aesthetic uncertainty).

### Wiring (`mcp/tools/design-craft.ts`)

- New optional input `responsiveMetrics?: ResponsiveMetrics[]` (test/programmatic seam) and `responsiveProbeCommand?: string` (mirrors `captureCommand`: receives target files via env, prints a `ResponsiveMetrics[]` JSON manifest — how a browserless CLI gets layout metrics; the Playwright MCP is one documented producer).
- Per benchmarked target, look up its metrics by `file`, run `computeResponsiveGate`, and `applyResponsiveGate` to the score's `awardBar`.

### Config (`config/schema.ts`, under `design.craft.benchmark.awardBar`)

```ts
responsive: z.object({
  require: z.boolean().default(false),
  viewport: z.number().int().positive().default(390),
  overflowTolerancePx: z.number().min(0).default(1),
}).optional(),
```

## Integration Points

- **Entry Points** — New `src/responsive/` module (mechanical). New optional MCP inputs `responsiveMetrics` / `responsiveProbeCommand` on `design_craft`. No new CLI command or skill.
- **Registrations Required** — Barrel export for `src/responsive/`. No skill-tier or route changes.
- **Documentation Updates** — `agents/skills/*/harness-design-craft/SKILL.md` BENCHMARK section (4 clients): document the responsive gate + manifest contract. Update the `AwardBar` scope doc (added in #1142) to reflect that the gate now exists and how `cleared`'s meaning depends on whether responsive was evaluated. Changeset.
- **Architectural Decisions** — **D1 (rendered probe over static/LLM)** and **D2 (shared floor module, awardBar consumes)** warrant one ADR (0085): they establish that mechanical, rendered facts gate a judgment verdict, and where that mechanical code lives relative to craft.
- **Knowledge Impact** — Ties into the design floor/ceiling boundary (`src/responsive` joins `src/drift`/`src/brand`/`src/audit` as a mechanical detector). When CRAFT_SCORE graph nodes land, `responsive.status` + defect kinds should be queryable alongside `awardBar.verdict`.

## Success criteria

1. `computeResponsiveGate` returns `defective` with a `horizontal-overflow` defect when `documentScrollWidth − viewportWidth > overflowTolerancePx`.
2. Returns `defective` with an `unreachable-nav` defect when neither a primary nav nor a menu toggle is visible.
3. Returns `clean` when metrics show no overflow and reachable navigation; `not-evaluated` when no metrics are supplied.
4. `applyResponsiveGate` forces `not-cleared` (reason `responsive-defects`) on a `defective` gate even when the aesthetic verdict was `cleared`.
5. With `require: false` (default), a `not-evaluated` gate leaves the aesthetic verdict unchanged (no regression to existing award-bar behavior/tests); with `require: true`, `not-evaluated` yields `indeterminate`.
6. Every `BenchmarkScore.awardBar` carries a `responsive` field; the value survives the MCP JSON round-trip.
7. `design.craft.benchmark.awardBar.responsive.*` overrides defaults (390 / 1px / require false).
8. All pre-existing design-craft + award-bar tests still pass.

## Implementation order

1. **Probe module** — `src/responsive/` types + `computeResponsiveGate` + manifest parsing; unit tests (overflow, unreachable-nav, clean, not-evaluated, tolerance boundary). Barrel export.
2. **Schema + composition** — add `responsive` to `AwardBar`; `applyResponsiveGate`; `require` semantics; config block. Extend award-bar tests (defective vetoes cleared; require/not-evaluated matrix; confidence-vs-responsive precedence).
3. **Wiring** — `responsiveMetrics` / `responsiveProbeCommand` inputs; per-target lookup + gate application in the pipeline; integration test through the MCP handler (JSON round-trip).
4. **Docs** — SKILL.md (4 clients), update the #1142 scope doc, ADR 0085, changeset.
