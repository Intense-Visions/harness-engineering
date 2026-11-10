---
'@harness-engineering/cli': patch
---

`generate-slash-commands` no longer doubles the dash prefix in a command's
`argument-hint`. Skill `cli.args` names that already carry their leading `--`
(every fleet skill) rendered as `[----fleets <--fleets>]`; they now render as
`[--fleets <fleets>]`. The committed plugin command wrappers are regenerated.
