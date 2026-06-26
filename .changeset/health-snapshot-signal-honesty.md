---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Reconcile health-snapshot `passed` flags with active signals (#528). A captured snapshot could report a check as `passed: true` while `signals[]` listed a contradicting problem, so the harness's own self-model — consumed by skill dispatch, recommendation, and insights — reported false-green.

`core` gains a canonical `health-signals` contract: a single `SIGNAL_REGISTRY` from which `CHECK_SIGNAL_MAP`, `SIGNAL_CATEGORY_MAP`, `SignalName`, and `HEALTH_SIGNAL_NAMES` are all derived, plus a pure `reconcilePassed` (conjunction, monotonic toward fail). `cli` wires `reconcilePassed` into `captureHealthSnapshot` so a check's `passed` can no longer be `true` against an active contradicting signal, and unifies `HEALTH_SIGNALS`/`SIGNAL_CATEGORIES` onto the registry. The `strength-007` strength rule now consumes the derived map, closing a silent entropy/deps/docs false-negative.

Behavior change: health snapshots and the dispatch/recommendation output they feed will now surface failures that were previously hidden behind false-green flags.
