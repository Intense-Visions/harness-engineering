---
'@harness-engineering/intelligence': patch
'@harness-engineering/cli': patch
---

feat(analyses): consume guardian diff-coverage findings from `.harness/analyses/` (#914)

Define a harness-owned, tolerant, advisory `GuardianAnalysis` contract
(`schema: harness.guardian.diff-coverage`) plus a degrade-safe reader that lists
`.harness/analyses/`, selects guardian records by discriminator, validates with
zod, and skips unknown/malformed shapes without ever throwing. Wire it into two
consumers: `outcome_eval` folds the guardian signal into the verdict rationale
(never affects TS-derived authority), and `pre-merge-brief` surfaces a Guardian
diff-coverage section and adds flagged records to "Worth your eyes". A missing or
empty archive leaves both consumers byte-identical to today.
