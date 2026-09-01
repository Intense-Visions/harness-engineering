---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(model-sentinel): model-update regression sentinel — supplier change-control
for the underlying model (Refs #1617).

Treats the underlying model as a vendored dependency: snapshots the configured
model identity (`agent.backends[*].model`), detects a change vs the last-seen
value, and appends a sentinel record to `.harness/model-sentinel/history.jsonl`.
Detect + report only.

- `@harness-engineering/core`: new pure `model-sentinel` module —
  `snapshotModelIdentities` (stable FNV-1a digest over the sorted identity set),
  `detectModelDrift` (per-backend added/removed/changed deltas + material/benign
  severity), an append-only JSONL store, and `evaluateModelSentinel` /
  `acknowledgeModelDrift` (acknowledgement re-pins the baseline by appending,
  never rewriting history).
- `@harness-engineering/cli`: `harness models drift` (`--history` / `--check` /
  `--ack`; reads the global `--config` / `--json` flags). `--check` exits
  non-zero on unacknowledged material drift for a CI/maintenance hook.

Scope note: this slice is detection + append-only reporting only. Deferred to a
follow-up (`Refs #1617`): the pinned behaviour-envelope sentinel suite with a
scheduled canary via the maintenance pipeline, and the routing hold gate that
holds affected model/task pairs until a human acknowledges.
