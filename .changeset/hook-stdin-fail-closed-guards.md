---
'@harness-engineering/cli': patch
---

fix(cli): protect-config and sentinel-pre must fail CLOSED when they cannot read stdin

Both are blocking `PreToolUse` guards that read their payload with
`readFileSync(0)` and treated _any_ throw as "no input", exiting 0 (allow) —
the same fail-open seam already fixed in `block-no-verify`. On a pipe fd 0 is
non-blocking, so a read issued before the writer has filled the pipe throws
`EAGAIN`: the guard went blind and waved the command through while still
reporting success — a bypass hiding behind a green check (#993). For
`protect-config` that means a protected linter/formatter config could be edited
unverified; for `sentinel-pre` it means taint enforcement silently switched off
mid-session.

Both now read stdin through the shared `readHookStdin()` helper, which retries
while the pipe reports `EAGAIN` (bounded, 5s) and reports read success
separately from read content. A read that _failed_ means the guard is blind and
it exits 2 (blocked); a read that _succeeded and returned nothing_ stays
fail-open, as do malformed JSON and (for `protect-config`) a missing
`file_path`. Regression tests drive a real read failure by opening a directory
as fd 0 (`EISDIR`) — closing fd 0 does not work because Node substitutes
`/dev/null`, which reads as empty rather than failing.
