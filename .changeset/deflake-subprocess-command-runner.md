---
'@harness-engineering/signals': patch
---

Deflake the `command-runner` subprocess test under full-suite parallelism.

`defaultCommandRunner` spawned its `execFile` child under a fixed 5s timeout.
Under a full-suite parallel test run — many workers each launching a fresh
`node` subprocess — even a bare launch can exceed 5s purely from host load, so
the fixed budget killed an otherwise-healthy child and surfaced a spurious
failure. The timeout is now an optional third argument (default unchanged at 5s,
exposed as `DEFAULT_COMMAND_TIMEOUT_MS`); callers on a loaded host can widen it,
and the runner's own test does so. A larger budget only tolerates a slow runner
— a genuine hang still fails — so it cannot mask a real defect. Production
behavior for real git/gh callers (the 5s default) is unchanged.
