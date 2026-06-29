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
  Each entry carries `check` (the contradicting check, `null` for metrics-only)
  and `category` (the parallel-safety bucket, `null` for uncategorized). The
  `CHECK_SIGNAL_MAP` (check -> contradicting signals, many-to-one), the `SignalName`
  union, `SIGNAL_CATEGORY_MAP` (signal -> category, null categories omitted), and
  `HEALTH_SIGNAL_NAMES` (ordered health-name list) are all DERIVED from it.
- The registry is the single source for THREE formerly-overlapping lists (SC4
  unification): the cli's `SIGNAL_CATEGORIES` (`dispatch-engine.ts`) re-exports
  `SIGNAL_CATEGORY_MAP`, and the health portion of the cli's `HEALTH_SIGNALS`
  (`recommendation-types.ts`) is spread from `HEALTH_SIGNAL_NAMES`. The cli-local
  `CHANGE_SIGNALS` and `DOMAIN_SIGNALS` (change-type + domain identifiers) stay in
  the cli: they are a dispatch concern, not health vocabulary, and the layer rule
  forbids core importing them. Behavior is preserved exactly — `SIGNAL_CATEGORIES`
  keeps its 9 keys/values and `HEALTH_SIGNALS` its 28 names in order.
- Both consumers import the contract: the cli capture path (`SIGNAL_RULES` typing +
  `reconcilePassed`), the cli dispatch/recommendation modules (categories + health
  names), and the core `strength-007` detector. Neither re-declares a local map.
  This respects the cli->core layer direction: the contract lives in core; the cli
  imports it; core must not import cli.
- `reconcilePassed` is a conjunction (`passed && !contradictingSignalPresent`),
  monotonic toward fail — it can demote a dishonest pass but never promote a real
  failure to green, and preserves assess failures with no signal (e.g. lint).
- The write path (`captureHealthSnapshot`) is the primary guarantee; `strength-007`
  is demoted to a defense-in-depth backstop for hand-edited or stale snapshots.

## Consequences

- Adding a signal is a single registry entry that flows to the name union, the check
  map, the category map, the ordered health-name list, and the cli's `SIGNAL_RULES`
  typing automatically — the drift class is removed, not just the current symptom.
- A future contributor must not re-introduce a local signal<->check map, signal
  category literal, or health-name list in cli or core; extend `SIGNAL_REGISTRY`
  instead. (change-type/domain signals remain legitimately cli-local.)
- Read-path stale caches are out of scope; they self-heal on regeneration and
  `strength-007` flags any that persist.
