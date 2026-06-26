---
number: 0047
title: Canonical signal<->check contract owned by core
date: 2026-06-26
status: accepted
tier: large
source: docs/changes/health-snapshot-signal-honesty/proposal.md
---

## Context

`health-snapshot.json` could report a check as `passed: true` while `signals[]`
listed a contradicting problem (observed: `security.passed: true` with 16 findings;
`docs.passed: true` with 27,481 undocumented symbols). The root cause was a
two-source-of-truth drift: the signal<->check mapping was declared independently in
the cli (`deriveSignals` / `SIGNAL_RULES`) and in the core `strength-007` detector
(a local `CHECK_SIGNAL_MAP`). The two had already diverged — `strength-007` looked
for signal names (`entropy-drift`, `dependency-violations`, `doc-coverage`,
`lint-issues`) that the cli never emits, so entropy/deps/docs mismatches were silent
false-negatives.

## Decision

**The health-signal vocabulary and its mapping to checks are a single canonical
contract owned by `@harness-engineering/core`, in `packages/core/src/health-signals/`.**

- One `SIGNAL_REGISTRY` list is the only literal declaration of signal names.
  `CHECK_SIGNAL_MAP` (check -> contradicting signals, many-to-one) and the
  `SignalName` union are DERIVED from it. A metrics-only signal is marked
  `check: null` and never maps to a check.
- Both consumers import the contract: the cli capture path (`SIGNAL_RULES` typing +
  `reconcilePassed`) and the core `strength-007` detector. Neither re-declares a
  local map. This respects the cli->core layer direction: the contract lives in
  core; the cli imports it; core must not import cli.
- `reconcilePassed` is a conjunction (`passed && !contradictingSignalPresent`),
  monotonic toward fail — it can demote a dishonest pass but never promote a real
  failure to green, and preserves assess failures with no signal (e.g. lint).
- The write path (`captureHealthSnapshot`) is the primary guarantee; `strength-007`
  is demoted to a defense-in-depth backstop for hand-edited or stale snapshots.

## Consequences

- Adding a signal is a single registry entry that flows to the name union, the check
  map, and the cli's `SIGNAL_RULES` typing automatically — the drift class is removed,
  not just the current symptom.
- A future contributor must not re-introduce a local signal<->check map in cli or
  core; extend `SIGNAL_REGISTRY` instead.
- Read-path stale caches are out of scope; they self-heal on regeneration and
  `strength-007` flags any that persist.
