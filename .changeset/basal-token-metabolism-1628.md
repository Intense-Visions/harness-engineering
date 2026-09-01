---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(metabolism): classify token spend into basal (maintenance burn) vs
anabolic (productive) from existing telemetry, and rank maintenance waste
(#1628).

Adds a pure `metabolism` module to `core` that reduces the existing adoption
(`SkillInvocationRecord`) + usage (`UsageRecord`) telemetry into a spend ledger,
classifies every token burst as `basal` / `anabolic` / `unattributable` by
outcome linkage, and emits the **basal-share metric** (with its declared
denominator and a separate unattributable bucket) plus a **ranked
maintenance-waste list** (which loop burns the most basal spend). A classifier
evaluator publishes confusion rates against a hand-labeled sample. Exposes it as
a read-only `harness burn metabolism` subcommand (`--json`) — a sibling lens to
`burn per-pr` and the by-skill/by-agent cuts — and as a by-token-metabolism
section in the full `harness burn` report.

Scope note: this slice is classification + reporting only. Wiring basal-share
into a budget/governor gate is deferred to a follow-up (see `Refs #1628`).
