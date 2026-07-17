---
'@harness-engineering/cli': patch
---

fix(cleanup): expose drift `type` and `line` in `harness cleanup --json` output

`harness cleanup` and `harness ci check` report the same underlying
documentation-drift finding but serialized it differently: `ci check` emitted
`{message:"Doc drift (api-signature): …", file, line}` while `cleanup` emitted
`{file, issue:"NOT_FOUND: …"}` — dropping the drift `type` (category) and the
`line`. A consumer filtering drift by category (e.g. `api-signature`) across
both commands silently saw zero for `cleanup` regardless of behavior, which read
as a false "cleanup honors the config but ci check doesn't" discrepancy (#838).

Each `driftIssues[]` entry now additionally carries `type` (the drift category)
and `line`, mirroring `ci check`. Purely additive — the existing `file` and
`issue` fields are unchanged. No threading change was needed: both commands
already honor `entropy.drift`; this only aligns their output shape.
