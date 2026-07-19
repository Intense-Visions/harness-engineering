---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): retry gh pr create + tell local executor to leave a clean diff

Two fixes toward shippable local PRs:

- **PR-create retry.** A branch that has just been pushed can be briefly invisible
  to `gh pr create` ("No commits between …" / not-found), which dropped a converged
  ship into the resumable "pushed but no PR" limbo. `shipWorkspace` now retries the
  PR create (bounded, overridable backoff), absorbing that push→PR propagation race
  and transient API blips.
- **Clean-diff instruction.** The local staged-execution prompt now tells the agent
  to delete scratch/debug files it created and to never touch files unrelated to the
  work item — so a converged unit produces a reviewable PR, not one carrying
  `debug-*.js` clutter.
