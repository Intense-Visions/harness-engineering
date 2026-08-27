---
title: Mid-Phase Context-Budget Trip Wire
slug: mid-phase-context-budget-trip-wire
issue: 1403
status: approved
keywords:
  - context-budget
  - trip-wire
  - resident-tokens
  - checkpoint-and-restart
  - window-keyed-threshold
  - smart-zone
  - HORTHY-1
---

# Mid-Phase Context-Budget Trip Wire

## Overview

Autopilot keeps context fresh **between** phases — every state dispatches a distinct
cold subagent (`harness-planner` → `harness-task-executor` → `harness-verifier` →
`harness-code-reviewer`), so the phase boundary _is_ a new process
(`agents/skills/claude-code/harness-autopilot/SKILL.md:13-23`). But nothing watches a
single long-running turn — one `harness-task-executor` grinding through a large phase, or
a fleet lane building an item end-to-end — for context creep **within its own turn**. Tool
output (file reads, CI logs, diffs) is the dominant, fastest-growing contributor to a
turn's resident tokens, and once a turn drifts into the "dumb zone" the model silently
degrades (deletes files, tries increasingly desperate fixes) instead of stopping.

This change adds a **documented, token-anchored trip wire**: a window-keyed threshold
policy plus a pure TypeScript helper that classifies a turn's resident-token count as
`ok | warn | trip`, and the autopilot / task-executor / skill-authoring discipline that
references it. Adapted from HumanLayer's smart-zone/dumb-zone context-engineering
practice ([HORTHY-1], `docs/research/dex-horthy-humanlayer-comparison-analysis.md`).

**Goal:** turn "hope the model behaves near its ceiling" into an explicit
converge-then-checkpoint-and-restart discipline, backed by a measurable threshold keyed
to the model's window size rather than a naive flat percentage.

## Decisions made

The threshold policy was **researched upstream and is locked** — this spec adopts it
verbatim rather than re-deriving it. Research corpus: Chroma _Context Rot_ (2025), NoLiMa
(arXiv 2502.05167), RULER (arXiv 2404.06654), _Lost in the Middle_ (arXiv 2307.03172),
Anthropic _Effective Context Engineering_ (2025), Horthy / _The Pragmatic Engineer_ (2025).

1. **Token-anchored, window-keyed — NOT a flat 40%.** Degradation is driven by
   **absolute resident tokens**, so the trip wire is keyed to window size. A flat percent
   is wrong, especially on 1M windows (40% of 1M = 400K resident tokens is deep in the
   dumb zone). The issue's own "~40% starting point" is explicitly superseded.

   | Model / window                   | Soft-warn (converge + flush state) | Hard trip (checkpoint-and-restart) |
   | -------------------------------- | ---------------------------------- | ---------------------------------- |
   | ~200K (Sonnet/Opus default)      | ~40% ≈ **80K**                     | ~50% ≈ **100K**                    |
   | 1M window (`[1m]` variants)      | ~25% ≈ **250K**                    | ~30–40% ≈ **350K**                 |
   | ≤128K local (Qwen / local coder) | **~30%**                           | **~35–40%** ≈ 45–50K               |

2. **Measured on TOTAL RESIDENT tokens** = input + output + tool results (not just the
   prompt). Tool output is usually the dominant, fastest-growing contributor.

3. **Prefer the model's REAL usage counter** (cumulative input tokens for the turn) over
   tokenizer estimation; fall back to a `chars/4` estimate only when usage isn't surfaced.
   The helper takes an already-measured `usedTokens` so the caller owns the source.

4. **Effective window ≈ 0.6 × nominal** (RULER). The absolute anchors above already bake
   this in. Utilization percentages are a **derived display value**; the trip fires on the
   absolute token count.

5. **Two-stage behavior.** `warn` ⇒ tell the running agent to _converge_ and _flush state
   to disk_. `trip` ⇒ _checkpoint-and-restart_ into a **cold subagent** seeded with the
   **distilled** (summarized, not raw-truncated — _Lost in the Middle_) state file,
   mirroring autopilot's between-phase cold dispatch.

6. **Extend, don't fork.** The existing context-budget system
   (`packages/core/src/context/`, PR #185) owns token-budget concerns; #1404 shipped the
   instruction-density check in the same module. This trip wire colocates as a sibling
   module (`context-budget-trip-wire.ts`), exported through the same `context/index.ts`
   barrel, mirroring `instruction-density.ts`.

## Technical design

### New module: `packages/core/src/context/context-budget-trip-wire.ts`

Pure, dependency-free, deterministic. No IO — the caller supplies the measured token count.

```ts
export type ContextBudgetVerdict = 'ok' | 'warn' | 'trip';

/** Absolute, window-keyed trip anchors (resident tokens). */
export interface ContextBudgetThresholds {
  /** Nominal window the anchors were keyed to. */
  window: number;
  /** Resident-token count at/above which to soft-warn (converge + flush state). */
  warnAt: number;
  /** Resident-token count at/above which to hard-trip (checkpoint-and-restart). */
  tripAt: number;
  /** Band label the window resolved to: '1m' | '200k' | 'local'. */
  band: ContextWindowBand;
}

export type ContextWindowBand = '1m' | '200k' | 'local';

export interface ContextBudgetEvaluation extends ContextBudgetThresholds {
  verdict: ContextBudgetVerdict;
  usedTokens: number;
  /** Derived DISPLAY-only utilization vs nominal window (usedTokens / window). */
  utilization: number;
  /** Derived DISPLAY-only utilization vs RULER effective window (0.6 × nominal). */
  effectiveUtilization: number;
}

export const EFFECTIVE_WINDOW_RATIO = 0.6; // RULER

/** Resolve the absolute warn/trip anchors for a nominal window size. */
export function resolveContextBudgetThresholds(
  window: number,
  overrides?: Partial<Pick<ContextBudgetThresholds, 'warnAt' | 'tripAt'>>
): ContextBudgetThresholds;

/** Classify a turn's resident-token count as ok | warn | trip. */
export function evaluateContextBudget(
  usedTokens: number,
  window: number,
  overrides?: Partial<Pick<ContextBudgetThresholds, 'warnAt' | 'tripAt'>>
): ContextBudgetEvaluation;
```

**Band resolution** (window matched to the nearest defined class at-or-below):

| Condition           | Band    | warnAt                 | tripAt                  |
| ------------------- | ------- | ---------------------- | ----------------------- |
| `window >= 900_000` | `1m`    | `250_000`              | `350_000`               |
| `window >= 150_000` | `200k`  | `80_000`               | `100_000`               |
| otherwise (local)   | `local` | `round(0.30 × window)` | `round(0.375 × window)` |

- The `1m` / `200k` bands use **absolute** anchors (the research anchors are floors keyed
  to a window _class_, not a fixed fraction of the exact window). The `local` band derives
  from ratios because sub-128K windows vary widely and the research expressed local as
  `~30% / ~35–40%`. `0.375` is the midpoint of the 35–40% hard-trip range.
- `verdict`: `usedTokens >= tripAt` → `trip`; else `usedTokens >= warnAt` → `warn`; else
  `ok`. Ties trip (>=), because being _at_ the anchor already means degradation risk.
- `overrides` let a project pin explicit anchors (e.g. via config) without changing the
  band logic; `tripAt` is clamped to be `>= warnAt`.
- `utilization` / `effectiveUtilization` are **display-only** derived values, never the
  trip condition.

### Barrel export

Add the module's public surface to `packages/core/src/context/index.ts` (auto-discovered
by `scripts/generate-core-barrel.mjs` — the `context` dir has its own `index.ts`, so no
manual allowlist edit is required; the generated root barrel is refreshed via
`pnpm run generate:barrels`).

### Documented discipline (prose is the primary deliverable)

1. **`agents/skills/claude-code/harness-autopilot/SKILL.md`** — new **"Context-Budget
   Trip Wire"** subsection under Process. States the two-stage policy, the window-keyed
   anchor table, the measurement rules, and how `trip` maps onto the existing recovery
   commit + cold re-dispatch machinery.
2. **`agents/skills/claude-code/harness-execution/SKILL.md`** — a mid-turn check in the
   per-task EXECUTE loop: after each task, evaluate resident tokens; on `warn` converge
   and flush `state.json` / `handoff.json`; on `trip` write a distilled handoff and stop
   for cold re-dispatch (the task-executor persona guidance).
3. **`agents/skills/claude-code/harness-skill-authoring/SKILL.md`** — a short guidance
   note (sibling to the existing instruction-density note) telling skill authors that a
   long-running turn should reference the trip-wire discipline and cite
   `evaluateContextBudget`.

## Integration Points

- **Entry Points** — One new core module (`context-budget-trip-wire.ts`) and its public
  functions (`evaluateContextBudget`, `resolveContextBudgetThresholds`) + types. No new
  CLI command, MCP tool, or skill — the feature is a helper plus documented discipline.
- **Registrations Required** — Barrel export via `context/index.ts` + `pnpm run
generate:barrels` (auto-discovered; no manual `generate-core-barrel.mjs` allowlist
  edit). Roadmap row `mid-phase-context-budget-trip-wire` promoted to `planned`.
- **Documentation Updates** — Autopilot SKILL.md (Context-Budget Trip Wire section),
  harness-execution SKILL.md (mid-turn check), skill-authoring SKILL.md (guidance note).
  SKILL.md edits regenerate plugin command mirrors (`pnpm run generate:plugin`).
- **Architectural Decisions** — None rise to a standalone ADR. The threshold policy is a
  documented, researched constant set colocated with the existing context-budget system,
  not a new architectural boundary.
- **Knowledge Impact** — Concept: "resident-token trip wire" (token-anchored, window-keyed,
  two-stage) as the intra-turn complement to autopilot's between-phase cold dispatch.

## Success Criteria

1. `evaluateContextBudget(usedTokens, window)` returns `ok` below `warnAt`, `warn` in
   `[warnAt, tripAt)`, and `trip` at/above `tripAt`, for each of the three bands.
2. A ~200K window yields `warnAt=80_000` / `tripAt=100_000`; a 1M window yields
   `warnAt=250_000` / `tripAt=350_000`; a 128K local window yields
   `warnAt≈38_400` / `tripAt≈48_000`.
3. `overrides` pin explicit anchors and `tripAt` is clamped `>= warnAt`.
4. `utilization` and `effectiveUtilization` are exposed as derived display values and are
   never used as the trip condition (RULER `0.6×` reflected in `effectiveUtilization`).
5. The public surface is exported from `@harness-engineering/core` and the generated
   barrel is fresh (`pnpm run generate:barrels:check` passes).
6. Autopilot, harness-execution, and skill-authoring SKILL.md each document the trip-wire
   discipline; plugin mirrors regenerate cleanly (`pnpm run generate:plugin:check`).
7. Sources cited in the module JSDoc and provenance: Chroma Context Rot, NoLiMa, RULER,
   Lost-in-the-Middle, Anthropic Effective Context Engineering, Horthy/Pragmatic Engineer.

## Implementation Order

1. **Core helper + tests** — author `context-budget-trip-wire.ts` (constants, band
   resolution, `resolveContextBudgetThresholds`, `evaluateContextBudget`), colocated
   `tests/context/context-budget-trip-wire.test.ts` covering all three bands, boundaries,
   overrides/clamp, and derived-utilization display.
2. **Barrel** — export from `context/index.ts`; regenerate barrels.
3. **Documented discipline** — add the autopilot, harness-execution, and skill-authoring
   sections; regenerate plugin mirrors.
4. **Verify + build** — `pnpm turbo build`, targeted tests, `harness validate`, barrel /
   plugin freshness checks.
