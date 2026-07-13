---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): split-routing `expects` narrows the prior-stage text channel (4b)

`expects` was declared, schema-valid, and documented on workflow stages but had no
runtime effect — the text channel threaded _every_ prior stage's output into
_every_ later stage's prompt. This activates it as a sound, opt-in filter:

- **Runtime:** a stage that declares `expects: <label>` now receives **only** that
  one upstream artifact in its prompt (instead of all priors) — leaner prompts and
  a smaller prompt-injection surface. Omitting `expects` keeps the full-priors
  default, byte-identical to before. If the named producer emitted no output, the
  channel is simply empty (never a crash).
- **Config-load validation:** a new cross-field refinement on
  `StagedWorkflowDeclSchema` rejects an `expects` that does not name a `produces`
  from an **earlier** stage (catches label typos, forward references, and
  self-references), with the error path pointed at the offending `stages[i].expects`.

Note on scope: this deliberately does **not** add file-path artifact threading.
All stages share one worktree, so files a stage writes are already on disk for
later stages; a `produces: { files: [...] }` manifest would only add a redundant
hint. The real gap was that `expects` did nothing — now it does.
