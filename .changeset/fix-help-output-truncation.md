---
'@harness-engineering/cli': patch
---

fix(cli): stop truncating piped command output at ~8KB

Commander writes help/version output with `process.stdout.write` and then exits.
Writes to a PIPE are asynchronous, so `process.exit()` discarded whatever was
still buffered: `harness --help` was cut mid-word at 8164 bytes whenever its
output was piped or captured, losing every command from `knowledge-pipeline`
onward — including `validate`. Reproducible on macOS, where the pipe drains in
smaller chunks than on Linux CI, which is why the repo's own
`tests/integration/cli.test.ts > harness --help > outputs help` assertion fails
locally while CI stays green.

Commander's output now goes through a synchronous fd write. The write is looped
until the buffer drains, because `writeSync` on a non-blocking pipe returns a
SHORT COUNT rather than throwing — a single call reproduces the same truncation
it was meant to fix — and retries `EAGAIN` while the reader catches up. Falls
back to the stream when the fd is unusable (EPIPE from a closed downstream
reader such as `head`, or a non-fd stdout).
