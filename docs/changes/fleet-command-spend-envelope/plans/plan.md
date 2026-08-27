# Plan — fleet-command spend envelope (#1600)

Derived from `../proposal.md`. Tasks are dependency-ordered.

## Implementation order

### T1 — Types: `packages/types/src/fleet-spend-budget.ts`

- `SpendEnvelope` (`envelopeTokens`, optional `perFleet`), `ObservedSpend`
  (`global`, optional `perFleet`), `SpendEnvelopeVerdict` (discriminated
  `within` / `exhausted` / `unconfigured`).
- Zod schema for the envelope (positive `envelopeTokens`), mirroring
  `fleet-context-budget.ts`.
- Export the shapes from `packages/types/src/index.ts`.

### T2 — Core primitive: `packages/core/src/fleet/spend-budget/index.ts`

- Pure, offline (no fs/network/gh): `isGlobalEnvelopeExhausted`,
  `isFleetAllocationExhausted`, `evaluateSpendEnvelope`.
- `export * from './spend-budget'` in `packages/core/src/fleet/index.ts`.
- Update the `fleet` DIR_COMMENTS entry in `scripts/generate-core-barrel.mjs`.
- Unit tests: `packages/core/src/fleet/spend-budget/index.test.ts` (boundary,
  under, over, per-fleet, unconfigured).

### T3 — Orchestrator delegates to the shared primitive

- `packages/orchestrator/src/core/budget-governor.ts`: `isGlobalEnvelopeExhausted`
  and `isFleetAllocationExhausted` compute effective spend then delegate the
  `>=` comparison to the core primitive (imported aliased). Signatures unchanged.

### T4 — CLI callable: `harness fleet budget-check`

- `packages/cli/src/commands/fleet/budget-check.ts` + `index.ts`.
- Reads envelope from flags (`--envelope`, `--period`, `--fleet`,
  `--fleet-envelope`), observed spend from burn (`readSummary` /
  `resolvePaths`), calls `evaluateSpendEnvelope`, prints verdict (`--json`),
  exit `0` within/unconfigured, `10` exhausted.
- Register `createFleetCommand` in `_registry.ts`.
- WIRED test `packages/cli/src/commands/fleet/budget-check.test.ts`: exhausted
  when burn spend >= envelope, within when under, unconfigured when no envelope.

### T5 — Docs contract

- `docs/reference/fleet-family.md`: new `## The global spend envelope
(fleet-command)` section requiring the DISPATCH consult + stop-clean-at-boundary.
- `agents/skills/claude-code/fleet-command/SKILL.md`: DISPATCH step references
  `harness fleet budget-check`; add to load-bearing artifacts. (4 mirrors are
  symlinks → update once; gemini `.toml` regenerates via pre-commit.)
- `pnpm run generate-docs` to refresh `docs/reference/*`.

### T6 — Provenance + verify

- `docs/changes/fleet-command-spend-envelope/provenance.json`.
- Build CLI, run targeted tests, typecheck, then full pre-commit/pre-push gates.

## Verification (WIRED)

Trace: `fleet-command` DISPATCH → `harness fleet budget-check` (call site) →
`evaluateSpendEnvelope` (core) ← same module the orchestrator `budget-governor`
delegates to. Test proves exhausted/within/unconfigured from burn-observed spend.
