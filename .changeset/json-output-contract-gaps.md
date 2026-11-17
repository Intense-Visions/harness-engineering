---
'@harness-engineering/cli': patch
---

fix(cli): close `--json` output-contract gaps found in the 14.1.0 smoke (#2673). Under `--json`, stdout now always carries one parseable document whose verdict agrees with the exit code:

- `comprehend --check --json` emits `{ ok, stale, orphans, skipped, semantic }` (previously `--json` was ignored and stdout was empty).
- `black-box list --json` emits `{ dir, runs }` (empty list included); `black-box show --json` emits `{ run }` or `{ error }`.
- `routing config|decisions|status|telemetry|trace --json` emit `{ error, status }` on stdout when the call fails (the message still goes to stderr; exit 2 unchanged).
- Any command group invoked with no subcommand under `--json` (e.g. `usage --json`, `adoption --json`) emits `{ error, command, subcommands }`; help on stderr and exit 1 are unchanged.
- `Error` instances embedded in JSON output now serialize with `name` and `message` (and their `cause` chain) instead of losing `message` — e.g. `linter validate --json`.
- MCP `serverInfo.version` reports the CLI package version instead of a hardcoded `2.3.1`; the compaction banner reports growth as `+N%` instead of `--N%`.
