---
'@harness-engineering/intelligence': patch
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

feat(analyses): consume guardian diff-coverage findings from `.harness/analyses/` (#914)

Define a harness-owned, tolerant, advisory `GuardianAnalysis` contract
(`schema: harness.guardian.diff-coverage`) plus a degrade-safe reader that lists
`.harness/analyses/`, selects guardian records by discriminator, validates with
zod, and skips unknown/malformed shapes without ever throwing. Wire it into three
review consumers:

- `outcome_eval` folds the guardian signal into the verdict rationale (never
  affects TS-derived authority).
- `pre-merge-brief` surfaces a Guardian diff-coverage section and adds flagged
  records to "Worth your eyes".
- `harness-code-review` (the 7-phase `runReviewPipeline`) surfaces the guardian
  summary as an advisory context file on every review bundle the agents receive.
  Read caller-side at the CLI layer (`run_code_review` MCP tool + `agent review`
  command) and passed in as plain data, so `@harness-engineering/core` never
  depends on `@harness-engineering/intelligence`.

A missing/empty/malformed archive leaves every consumer byte-identical to today.
