---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add failure-reason categorization to `.harness/metrics/adoption.jsonl`.

Adoption records previously captured `outcome: completed | failed | abandoned` —
the _what_ of a skill run without the _why_. A new optional `failureCategory`
field records the reason a run did not complete, drawn from a small closed
taxonomy (`FailureCategory`): `prerequisite-missing`, `gate-rejected`,
`user-cancelled`, `timeout`, `dependency-failure`, `agent-error`, and
`inconclusive`.

The category is derived by the adoption-tracker hook at the failure/gate points
already present in the skill-event stream: an `error` event's `failureType` is
mapped through a keyword table (defaulting to `agent-error`), and a failed
`gate_result` yields `gate-rejected`. It is only emitted when a reason is
determinable — completed runs and reason-less abandonments carry no category, so
the field is never guessed.

The field is optional and additive: records written before it existed still
parse, and the reader drops any unrecognized value. Downstream consumers now use
it — the skill-effectiveness scorer (`detectFailingSkills`) reports a
per-skill `failureCategories` breakdown, and the catalog retrospective adds a
per-skill breakdown, a catalog-wide `failureCategoryTotals`, and a rendered
"Failure categories" section — so failing skills can be grouped by _why_ they
fail, not just how often.
