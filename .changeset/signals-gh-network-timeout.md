---
'@harness-engineering/signals': patch
---

Stop killing the `gh pr list` fetch at 5 seconds and reporting it as an auth failure.

`defaultCommandRunner` applied one 5s budget to every command. That is a local-process
budget — ample for `git log`, and far too tight for the paginated
`gh pr list --limit 500 --json ...,reviews` network query the signal authorities make,
which measures ~10-14s against a real repository. It was `SIGTERM`-killed every time, and
because Node's timeout error is `Command failed: <argv>` with an empty stderr tail, both
providers wrapped it as `gh unavailable or not authenticated` — a cause they never
verified. `harness holiday-confidence` and the `pr-merged-without-multi-persona-review`
signal silently degraded to `error` / `0/0` on any repository whose 30-day merged-PR list
takes over 5s to fetch.

`CommandRunner` now carries an optional `timeoutMs`, because the budget is a property of
the call rather than of the runner; a mock that ignores it stays assignable. Both `gh` call
sites pass the new `NETWORK_COMMAND_TIMEOUT_MS` (30s). A budget kill rejects with a message
that names the timeout, so "too slow" is distinguishable from "broken or unauthenticated",
and the providers report the underlying failure instead of asserting a cause.

Adds `NETWORK_COMMAND_TIMEOUT_MS` and `DEFAULT_COMMAND_TIMEOUT_MS` to the package exports.
