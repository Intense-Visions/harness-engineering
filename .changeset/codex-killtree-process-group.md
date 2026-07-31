---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): kill codex's whole process group on stopSession/timeout

The codex child was spawned without its own process group, so `stopSession`'s
`SIGKILL` reached only the direct child. A grandchild it spawned (or, in the unit
test, a shell's `sleep`) survived and kept the stdout pipe open, so draining hung
past the stage deadline — surfacing as a flaky 10s test timeout in
`codex.test.ts > stopSession …` on Linux CI (macOS reaped the grandchild, hiding
the gap). The child is now spawned `detached` (its own group) and both the
wall-clock timeout and `stopSession` kill the whole group via `process.kill(-pid)`
(POSIX; Windows falls back to a direct child kill). A stage-deadline abort now
reliably terminates codex and everything it started.
