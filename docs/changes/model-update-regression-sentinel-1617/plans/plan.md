# Plan — Model-update regression sentinel

Issue: Intense-Visions/harness-engineering#1617
Slug: `model-update-regression-sentinel-1617`

## Goal

Detect when the underlying model identity (configured `agent.backends[*].model`)
changes vs the last-seen value and emit an append-only sentinel record + a
human-readable changelog. Detect + report only — no heavy eval suite, no routing
gate (both deferred, `Refs #1617`).

## Tasks

### T1 — Core module `packages/core/src/model-sentinel/` (pure)

- `types.ts` — `BackendModelIdentity`, `ModelSnapshot`, `BackendModelDelta`,
  `DriftSeverity`, `ModelDriftResult`, `SentinelRecord`, `SentinelCycleResult`.
- `snapshot.ts` — `snapshotModelIdentities(backends, now?)`:
  - Accept a loosely-typed `Record<string, unknown>` (the shape of
    `config.agent.backends`), read each def's `type` (string) and `model`
    (string | string[]), normalise to a sorted `models: string[]`.
  - Produce `ModelSnapshot` with backends sorted by name and a stable `digest`
    (FNV-1a hash over canonical JSON — no crypto/network dep).
- `drift.ts` — `detectModelDrift(previous, current)`:
  - Pure diff → per-backend `BackendModelDelta`; classify `kind`
    (initial | unchanged | changed) and `severity` (none | benign | material).
  - Material: any backend added/removed or a backend's model set changed.
- `store.ts` — fs boundary:
  - `readSentinelHistory(projectRoot)` → `SentinelRecord[]` (skip malformed lines
    w/ stderr warning, mirror `adoption/reader.ts`).
  - `latestSnapshot(records)` → `ModelSnapshot | null`.
  - `appendSentinelRecord(projectRoot, record)` — mkdir -p + append one JSONL line
    to `.harness/model-sentinel/history.jsonl` (append-only).
- `evaluate.ts` — `evaluateModelSentinel(projectRoot, backends, now?)`:
  - read history → snapshot → detect vs latest → append iff `kind === 'changed'`
    OR history empty (initial baseline) → return `SentinelCycleResult`.
  - `acknowledgeModelDrift(projectRoot, note?, now?)` — append an `acknowledged`
    record re-pinning the current snapshot (never rewrites history).
- `index.ts` — barrel (`export *` from each). `model-sentinel` is auto-discovered
  by `scripts/generate-core-barrel.mjs`; run `pnpm run generate:barrels`.
- Tests: `snapshot.test.ts`, `drift.test.ts`, `store.test.ts`, `evaluate.test.ts`
  (fixtures for initial / unchanged / material-swap / added-backend / malformed line
  / ack-appends-not-rewrites).

### T2 — CLI `harness models drift`

- Extend `createModelsCommand()` in `packages/cli/src/commands/models.ts` with a
  `drift` subcommand:
  - `resolveConfig` → `agent.backends`; `evaluateModelSentinel(projectRoot, backends)`.
  - Render human changelog or `--json`.
  - `--history` — print full append-only changelog.
  - `--check` — exit non-zero on material, unacknowledged drift (CI/hook gate).
  - `--ack [note]` — append acknowledgement record.
- `runModelsDrift(opts)` extracted as a testable function (like `runModelsProbe`).
- Test: `models-drift.test.ts` — initial baseline, no-op on unchanged, drift+exit
  code on swap, `--ack` clears the `--check` gate.

### T3 — Barrels, build, gates

- `pnpm run generate:barrels` (core barrel) + regenerate CLI registry if needed.
- `pnpm turbo build`; `pnpm -w typecheck`; run new tests; `check-arch` baseline.
- Reference docs if CLI surface changed (`pnpm run generate-docs`).

## Out of scope (remainder → Refs #1617)

- Pinned sentinel suite with behaviour envelopes (tool-call shape, verdict
  distribution, schema conformance, latency/cost bands) + scheduled canary via the
  maintenance pipeline (`task-registry.ts` `report-only` task).
- Routing gate/hold on material drift (consume the event in `BackendRouter`).
- Server-side silent-swap detection behind a fixed id (needs live probe/telemetry).

## Risks

- Loose typing of `agent.backends`: normalise defensively (skip non-object defs,
  coerce non-string models out) so a malformed config never crashes the cycle.
- Append-only guarantee: `store` only ever appends; ack is a new record.
- Digest stability: canonical JSON with sorted keys + sorted models so semantically
  identical configs hash identically.
