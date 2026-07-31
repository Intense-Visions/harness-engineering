---
'@harness-engineering/cli': patch
---

fix(cli): block-no-verify hook must fail CLOSED when it cannot read stdin

`block-no-verify` read its payload with `readFileSync(0)` and treated _any_
throw as "no input", exiting 0 (allow). On a pipe that fd is non-blocking, so a
read issued before the writer has filled the pipe throws `EAGAIN` — and the
guard silently stopped enforcing while still reporting success. That is how
`git commit --no-verify` could pass a hook that CI showed as green; it surfaced
as an intermittent `expected +0 to be 2` on the macOS runner (run 30671939046).
Issue #619 addressed the symptom by changing how the _test_ fed stdin, leaving
the fail-open seam in the hook itself.

Stdin reading moves to a shared `readHookStdin()` helper that retries while the
pipe reports `EAGAIN` (bounded, 5s) and reports read success separately from
read content. The hook now distinguishes the two cases that were conflated: a
read that _failed_ means the guard is blind and it exits 2 (blocked), while a
read that _succeeded and returned nothing_ is a legitimate empty invocation and
stays fail-open, as do malformed JSON and a missing `tool_input`.

Note: `protect-config.js` and `sentinel-pre.js` are also blocking guards with
the same fail-open read seam and are tracked separately.
