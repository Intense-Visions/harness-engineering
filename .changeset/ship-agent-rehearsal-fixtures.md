---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Ship agent-rehearsal fixtures and the `harness rehearse` skill/command.

`templates/rehearsal-fixtures/` now carries a set of tiny, self-contained,
deliberately-broken fixtures — each planting exactly one failure mode that a
real harness check is designed to catch: a hardcoded secret (`check-security`),
an architectural layer violation and a circular import (`check-arch`), and a
broken documentation link (`check-docs`). Each fixture ships a `rehearsal.json`
manifest — the ground truth for what was planted, the check that should catch
it, the expected fix, and a four-dimension scoring rubric.

A new `harness rehearse` command drives them: `list` enumerates the fixtures,
`show <id>` prints a manifest + rubric, and `score --fixture <id> --recovery
<record.json>` grades a structured recovery record with a deterministic,
IO-free, LLM-free scorer (0-100 across `detected` / `correctCheck` / `fixed` /
`noCollateral`, with pass/partial/fail tiers). The `harness:rehearse` skill
(all four platforms) orchestrates the loop — stage a scratch copy, detect and
repair the planted defect, assemble the record, and score. Use it to train
personas before production trust, to regression-test the harness's own gates
against known failure shapes, and to let adopters verify their gates fire.

The scoring engine, catalogue loader, and contracts (`scoreRecovery`,
`loadCatalog`, `findFixture`, `RehearsalManifest`, `RecoveryRecord`,
`RehearsalScore`) are exported from `@harness-engineering/core`.
