---
type: business_concept
domain: core
tags: [health-signals, signal-registry, reconcile, health-snapshot, contract]
---

# Health-signal contract

**Concept:** `health-signal-contract` — a single registry from which the
check<->signal map is derived, with snapshot `passed` flags reconciled
monotonically-toward-fail against active signals.

## What it is

`packages/core/src/health-signals/index.ts` owns the canonical health-signal
vocabulary. `SIGNAL_REGISTRY` is the single source of truth: an array of
`{ name, check, category }` where `check` is a `CheckKey` or `null` (metrics-only)
and `category` single-sources `SIGNAL_CATEGORY_MAP` (the parallel-safety bucket,
`null` when the signal belongs to no bucket). From it are derived:

- `SignalName` — the union of all signal names.
- `CHECK_SIGNAL_MAP` — `CheckKey -> SignalName[]` (many-to-one), built by grouping
  the registry on `check` and skipping `null`. Every `CheckKey` is present; a check
  with no signals (e.g. `lint`) maps to `[]`.
- `reconcilePassed(checks, signals)` — pure conjunction that keeps `passed` true
  only if assess passed AND no contradicting signal is present. Never flips
  false -> true.

## Relationships

- `captureHealthSnapshot` (cli) **depends-on** the registry: it imports
  `reconcilePassed` and applies it after `deriveSignals`, and types `SIGNAL_RULES`
  against `SignalName`. This is the primary honesty guarantee (write path).
- `strength-007` (core) **depends-on** the registry: it imports `CHECK_SIGNAL_MAP`
  as a defense-in-depth backstop for snapshots that bypass the write path.

## Invariant

A snapshot from `captureHealthSnapshot` never has `checks[k].passed === true` while
any signal in `CHECK_SIGNAL_MAP[k]` is present in `signals[]`. Metrics-only signals
(`check: null`) never affect any `passed` flag.

## See also

- ADR 0047 — Canonical signal<->check contract owned by core.
- Spec: `docs/changes/health-snapshot-signal-honesty/proposal.md`.
