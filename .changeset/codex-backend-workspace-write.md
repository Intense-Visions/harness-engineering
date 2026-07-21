---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): codex backend uses `--sandbox workspace-write`, not the dangerous full bypass

The initial `codex` backend (#946) ran `codex exec --dangerously-bypass-approvals-and-sandbox`.
A live trial surfaced a failure mode: on an exploratory task codex spawned an interactive
command and the session aborted with `write_stdin failed: stdin is closed for this session`.
Switching to `--sandbox workspace-write` fixes it (0 such errors in a re-run) while STILL
letting codex apply edits and run the gate — verified by 21 in-session `pnpm typecheck lint
test` invocations under the sandbox. exec mode already runs approval-free (`approval:
never`), reads are unrestricted (the pnpm store resolves), and writes are confined to the
worktree — appropriate since the orchestrator dispatches codex into an isolated worktree.
Also less dangerous than the full bypass.
