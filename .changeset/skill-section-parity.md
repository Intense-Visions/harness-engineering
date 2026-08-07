---
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

Make the two skill required-section gates read one source of truth.

The `harness skill validate` CLI validator and the `agents/skills` vitest
structure test each maintained their own copy of the required-section lists,
and they had drifted: the validator required `## Rationalizations to Reject`
on behavioral skills while the structure test did not, so skills missing that
section passed CI on the weaker gate.

`@harness-engineering/core` now exports the canonical lists —
`BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, and
`RIGID_SECTIONS` — from a new `skills/required-sections` module. The CLI
validator (`harness skill validate`) imports them instead of its former inline
copies, so both gates derive their rules from the same constant and cannot
silently diverge again. Validator behavior is unchanged; this is an
internal dedup plus a new public export.
