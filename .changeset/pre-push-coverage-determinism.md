---
'@harness-engineering/cli': patch
---

Make the runtime hooks read stdin resiliently under load. `adoption-tracker`,
`pre-compact-state`, `telemetry-reporter`, `sentinel-post`, and `cost-tracker`
now read stdin through the shared `readHookStdin()` helper (already used by the
enforcing hooks) instead of a raw `readFileSync(0)`. The helper retries the
EAGAIN that fd 0 throws when the writer hasn't filled the pipe yet, so under
compound load (the pre-push `test:coverage` gate running these hooks under v8
coverage) the hooks no longer mistake pipe backpressure for empty stdin and
silently skip their work — the dominant source of non-deterministic failures in
the pre-push gate (#620). Behavior is otherwise unchanged: these log-only hooks
still fail open on a genuine read failure or empty stdin.
