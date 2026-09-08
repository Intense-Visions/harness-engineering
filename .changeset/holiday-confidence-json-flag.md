---
'@harness-engineering/cli': patch
---

Fix `harness holiday-confidence --json` emitting pretty text instead of JSON

The root program declares a `--json` flag and so does this subcommand. Commander
binds a repeated flag to the first command that declared it, so
`harness holiday-confidence --json` stored `json: true` on the program and left
the subcommand's own `opts.json` undefined — making `--json` a silent no-op.

The weekly Holiday Confidence Tracker workflow pipes this command's stdout
straight into `JSON.parse`, so the parse threw on the pretty-text render and the
tracker abstained on every run since it shipped. The command now reads
`cmd.optsWithGlobals()`, the idiom already used by `snapshot`, `usage`,
`scan-config` and `create-skill` for exactly this collision.

Refs #1965.
