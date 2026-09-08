# Plan — Lift `packages/cli` branch coverage above the bar (#544)

Route: FEATURE / test-coverage. Pipeline: harness-brainstorming (scope) → harness-autopilot
(author tests, raise coverage, update baseline). Lean on tdd / test-advisor / canary-test-author
for the test authoring.

## Problem

`packages/cli` sits at **68.36% branches** (11579 / 16936) on the user-facing surface
(measured `pnpm --filter @harness-engineering/cli test:coverage` at base `70b9cda95`).
`coverage-baselines.json` records the committed floor (branches 68.28). The article's bar:
a green build should be enough to push to production; 68% branches on the CLI entry point
does not clear it.

### Targets

1. **≥80% branches** for `packages/cli`.
2. **Tighten the V8 variance tolerance for cli specifically to 0.1%** (default stays 0.5%).

## Approach

### 1. Per-package variance tolerance (`scripts/coverage-ratchet.mjs`)

The tolerance is a single global constant `V8_VARIANCE_TOLERANCE = 0.5`, used by both
`evaluateCoverage` (the gate) and `mergeCoverageBaselines` (the `--update` merge). Introduce a
per-package override map `PACKAGE_VARIANCE_TOLERANCE = { 'packages/cli': 0.1 }` plus a
`toleranceFor(pkgKey)` helper, and thread it through both functions so cli is graded/merged at
0.1% while every other package keeps 0.5%. Add unit tests to
`tests/scripts/baseline-gating.test.mjs` for the per-package selection in both the gate and the
merge.

### 2. Raise branch coverage with real behavior tests

V8 coverage only measures files imported by the run, so the denominator is the currently-exercised
surface. Rank files by **uncovered branch count** (the biggest levers) and write real behavioral
tests — genuine error paths, output-mode branches (JSON vs text vs verbose), option parsing,
empty-vs-populated result rendering, and failure/exit-code paths — not assertion-free padding.

Highest-value targets (uncovered branches, at base):

- Craft command wrappers, many at 0%: `naming-craft` (36), `copy-craft` (40), `test-craft` (44),
  `security-craft` (30), `spec-craft` (28), `api-craft` (26), `code-craft` (24), `docs-craft` (22),
  `knowledge-craft` (22), `cli-ergonomics-craft` (24), `design-pipeline` (41).
- Craft internals: `shared/craft/llm/provider.ts` (51), `security-craft/extract/signals.ts` (33),
  `design-craft/phases/benchmark.ts` (25), `copy-craft/index.ts` (21), `code-craft/extract/units.ts`
  (21), `naming-craft/index.ts` (19).
- Large commands: `comprehend.ts` (119), `roadmap/triage.ts` (93), `validate.ts` (74),
  `check-design.ts` (61), `update.ts` (56), `models.ts` (54), `cleanup-sessions.ts` (58),
  `check-harness-strength.ts` (53), `align-design-system.ts` (52), `init.ts` (40), `mcp.ts` (40),
  `migrate.ts` (44), `generate-slash-commands.ts` (45).
- MCP tools: `assess-project.ts` (74), `gather-context.ts` (40), `docs-publish.ts` (39),
  `design-craft.ts` (37), `state.ts` (30), `architecture.ts` (27), `roadmap-file-less.ts` (45),
  `roadmap.ts` (40).

### 3. Set the floor safely under 0.1% tolerance

The caveat: V8 branch pct jitters run-to-run, sometimes by more than 0.1%. So the committed cli
branch floor is set **comfortably below the reliably-measured value** (margin > jitter), while
still ≥80. Concretely: drive measured branches to ≥ ~80.5%, then set the cli baseline branches to a
value that leaves headroom so `actual < floor - 0.1` cannot trip on noise across all-OS CI. Verify
locally with `test:coverage` + `node scripts/coverage-ratchet.mjs` before pushing.

## Verification

- `pnpm --filter @harness-engineering/cli test:coverage` → branches ≥ 80 (and ≥ committed floor).
- `node scripts/coverage-ratchet.mjs` passes with the new floor + 0.1% cli tolerance.
- `node --test tests/scripts/baseline-gating.test.mjs` passes (per-package tolerance).
- Full pre-push gate green (coverage-ratchet gate included).

## Slice discipline

If ≥80% is not fully reachable in one lane, land the tolerance change + a substantial coverage
improvement as a slice and `Refs #544` with the exact % achieved and what remains.
