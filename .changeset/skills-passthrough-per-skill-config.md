---
'@harness-engineering/cli': minor
---

config(skills): allow a skill to carry its own settings under `skills.<skillName>`

`HarnessConfigSchema.skills` gains `.passthrough()`, so a section like
`skills.branchBuster.gates` or `skills.startWork.statusSyncWorkflow` survives the
config load instead of being stripped. Declared keys (`alwaysSuggest`,
`neverSuggest`, `tierOverrides`, `instructionBudget`) keep their types and
validation exactly as before — this only stops unknown sibling keys being dropped.

Minor rather than patch: it is new capability for config authors, not a fix to
existing behaviour. Nothing that parsed before parses differently.

The alternative — registering a second top-level `skills` key, following the
`pulse` / `waypoint` passthrough precedent — is a trap worth recording. It
**silently overrides** the existing one (JS object-literal semantics, last key
wins), widening `tierOverrides` to `unknown` and breaking three call sites in
`mcp/tools/`. The config still parsed and no test failed; only `turbo typecheck`
caught it.

Needed because 791 skills will not fit in a top-level namespace, and a skill's
settings are validated by the skill rather than by the CLI. A skill MUST treat an
absent section as "nothing configured" and abstain rather than assume a default
toolchain.
