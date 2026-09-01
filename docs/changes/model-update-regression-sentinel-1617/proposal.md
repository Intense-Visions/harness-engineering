# Proposal — Model-update regression sentinel (supplier change-control)

Issue: Intense-Visions/harness-engineering#1617
Slug: `model-update-regression-sentinel-1617`
Route: feature · Stage: brainstorming (scoped spec)

## Problem

The underlying LLM is the harness's most load-bearing dependency and the only one
with **no change control**. Configured model ids/versions change (a backend's
`model` is re-pinned, a provider silently ships a new snapshot behind the same id,
an operator swaps `claude-opus-4-8` → a successor) and every installation
discovers the shift through a broken workflow. Treat the model as a vendored
dependency: **record the active model identity, detect a change vs the last-seen
value, and emit an append-only sentinel record + human-readable report on change.**

## Scope (recommended default — detect + report only)

IN scope (this change):

- **Model-identity snapshot** derived from the existing configured source of truth
  (`harness.config.json` → `agent.backends[*].model`), not a new parallel source.
- **Drift detection** vs the last recorded snapshot: per-backend added / removed /
  changed model ids, with a severity classification.
- **Append-only history** persisted at `.harness/model-sentinel/history.jsonl`
  (the established `.harness/metrics/*.jsonl` pattern). The changelog is
  append-only; nothing is ever rewritten.
- **`harness models drift`** CLI subcommand under the existing `models` group:
  snapshot → compare → record-on-change → render (human + `--json`), plus
  `--history` to print the append-only changelog and `--check` for a CI/hook
  exit-code gate (non-zero on unacknowledged drift).

OUT of scope (deliberately deferred — flagged as remainder, `Refs #1617`):

- The full pinned **sentinel suite** with per-task expected-behaviour envelopes
  (tool-call shape, verdict distributions, output-schema conformance, latency/cost
  bands) and its scheduled canary run via the maintenance pipeline.
- The **routing gate / hold** (material drift holds routing until human ack). This
  change emits the trust event and an explicit-acknowledgement re-pin; wiring that
  event into the router's hold path is the follow-on.
- Provider-side snapshot introspection (detecting a silent server-side model
  swap behind an unchanged id) — requires a live probe/telemetry channel; the
  config-identity detector is the deterministic, offline-testable floor.

## Design

Pure, network-free logic lives in `@harness-engineering/core`
(`packages/core/src/model-sentinel/`, an `export *` auto-discovered barrel dir);
the CLI is a thin gather + render + persist wrapper.

### Core: `packages/core/src/model-sentinel/`

- `types.ts`
  - `BackendModelIdentity = { backend: string; type: string; models: string[] }`
  - `ModelSnapshot = { takenAt: string; backends: BackendModelIdentity[]; digest: string }`
    — `backends` sorted by name, `models` sorted, `digest` a stable content hash so
    an unchanged config produces an identical digest.
  - `BackendModelDelta = { backend: string; status: 'added'|'removed'|'changed'|'unchanged'; before: string[]; after: string[]; addedModels: string[]; removedModels: string[] }`
  - `DriftSeverity = 'none' | 'benign' | 'material'`
  - `ModelDriftResult = { kind: 'initial'|'unchanged'|'changed'; severity: DriftSeverity; deltas: BackendModelDelta[]; previousDigest: string|null; currentDigest: string }`
  - `SentinelRecord = { id; observedAt; snapshot: ModelSnapshot; drift: ModelDriftResult; acknowledged: boolean }`
- `snapshot.ts`
  - `snapshotModelIdentities(backends, now?)` — normalises the loosely-typed
    `agent.backends` record (each def carries `type` and `model: string|string[]`)
    into a deterministic `ModelSnapshot` with a stable digest (djb2/FNV over the
    canonical JSON — no crypto dep).
- `drift.ts`
  - `detectModelDrift(previous, current)` — pure diff. A backend appearing/vanishing
    or any model id changing is `changed`; severity is `material` when a backend's
    resolved model set changes or a backend is added/removed, `benign` when only
    ordering/aliasing normalises, `none` when digests match.
- `store.ts`
  - `readSentinelHistory(projectRoot)` — parse `.harness/model-sentinel/history.jsonl`,
    skip malformed lines with a stderr warning (mirrors `readAdoptionRecords`).
  - `latestSnapshot(records)` — last snapshot, or null.
  - `appendSentinelRecord(projectRoot, record)` — `mkdir -p` + append one JSONL line
    (never rewrites — append-only guarantee).
  - `acknowledgeLatest(projectRoot, ...)` — append a NEW record marking the current
    snapshot acknowledged (re-pins the baseline by appending, preserving history).
- `evaluate.ts`
  - `evaluateModelSentinel(projectRoot, backends, now?)` — orchestrates
    read-history → snapshot → detect → (append iff changed) → return a
    `SentinelCycleResult { record, drift, wroteRecord, previousDigest }`.

### CLI: `harness models drift`

Added to the existing `models` group in `packages/cli/src/commands/models.ts`.

- Loads `harness.config.json` via `resolveConfig`, reads `agent.backends`.
- Runs `evaluateModelSentinel(projectRoot, backends)`; renders a human changelog
  (or `--json`). On first run records the initial baseline quietly.
- `--history` — print the append-only changelog (all recorded drift events).
- `--check` — exit non-zero when the latest cycle detected material, unacknowledged
  drift (for a maintenance/CI hook); zero otherwise.
- `--ack` — append an acknowledgement record re-pinning the current snapshot.

## Acceptance criteria (this scope)

- A simulated model swap in fixtures (a `backends` map whose `model` differs from
  the recorded baseline) produces a drift record with `kind:'changed'`,
  `severity:'material'`, and per-backend deltas within one `harness models drift`
  cycle.
- An unchanged config produces `kind:'unchanged'` and writes **no** new record
  (quiet — not a hold).
- The history file is append-only: acknowledgement appends a record and never
  mutates or deletes prior lines; `--history` shows the full chain.
- Malformed history lines are skipped with a warning, never crash the command.

## Wiring / integration points

- Source of truth: `harness.config.json` → `agent.backends[*].model`
  (same map `harness models probe` and `BackendRouter` consume).
- Persistence: `.harness/model-sentinel/history.jsonl` (established `.harness` store).
- Surface: `harness models drift` (existing `models` command group).
- Follow-on (out of scope): the maintenance pipeline schedules the cycle and the
  router consumes the `material` drift event as a hold — filed as remainder.

## Assumptions

- Recommended-default scope: detect model-id/version change vs last-seen + emit an
  append-only sentinel record/report; detect-and-report only, no auto heavy-eval.
- Model identity = configured `agent.backends[*].model` (string or array). This is
  the deterministic, offline-testable identity; server-side silent swaps behind a
  fixed id are deferred (need a live probe channel).
- Core stays pure/network-free and fs lives behind the `store` module, mirroring
  `adoption/reader.ts`.
