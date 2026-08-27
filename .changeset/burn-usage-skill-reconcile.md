---
'@harness-engineering/burn': minor
'@harness-engineering/cli': minor
---

Add an invoking-skill attribution cut to burn so its breakdown reconciles with Claude
Code's `/usage`. burn previously grouped subagent spend only by agent TYPE
(`attributionAgent`), while `/usage` groups the same spend by the SKILL that spawned it
(`harness:roadmap-fleet`, `harness:autopilot`, …), so the two views could never
reconcile — `/usage` showed rows burn had no equivalent for. Each turn now also records
`invokingSkill` (derived from the transcript's `attributionSkill`, already a
fully-qualified `plugin:skill` value), the summary carries a `skills` block alongside
`agents`, and `harness burn report` leads with a `by invoking skill` section that states
its window (week-to-date vs `/usage`'s last-24h) so a mismatch reads as a different
question, not a wrong number. Both cuts coexist and partition the same weekly total. A
turn with no readable skill is grouped honestly as `unattributed-skill` (never dropped,
never fabricated); legacy rows are `pre-migration`. The `usage.tsv` store widened from
nine to ten columns with a `STORE_VERSION` bump that forces one re-derivation from
transcripts on disk. burn's default window is unchanged.
