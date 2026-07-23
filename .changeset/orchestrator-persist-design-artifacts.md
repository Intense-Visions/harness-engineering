---
'@harness-engineering/orchestrator': minor
---

fix(orchestrator): persist design-stage artifacts (spec/plan) to disk

The staged workflow computed a `documentPath` (`docs/changes/<slug>/proposal.md`, `…/plans/…`)
and instructed each DOCUMENT stage to write its `produces:` artifact there — but nothing
persisted it. The stage output was captured in-memory (for chaining + the resume checkpoint)
and never written, so a local reasoner that reasons WITHOUT writing the file left the design
phase hollow: the brainstorming/planning stages ran, yet no proposal or plan ever landed in
the worktree (observed across every local-autopilot e2e run).

Add a `persistStageDocument` seam: after a passing document stage, write the captured stage
output to its `documentPath` when the model did not already write a non-empty file there.
Guarantees the design phase's artifact exists (best-effort, never clobbers a model-authored
doc, no-op for non-document stages / empty output / legacy contexts).

The stages were also **misrouted**: `resolveStageBackend` returned a materialized backend whose
`.name` is a TYPE label (`ollama`/`codex`), not a routing key. `makeRunner` re-materializes by
that name and `isLocalBackend` looks it up in the config's backends map — both missed, so every
design stage silently fell through to `routing.default` (ran on the coder, not the reasoner) AND
got the Claude-shaped prompt template instead of the local `harness skill run --autonomous`
template (the real reason codex produced empty worktrees locally). Fixed by returning the routing
name via `resolveName`.

The capture itself was also broken for local backends: the stage runner harvests a stage's
final text only from a `type:'result'` event, but the codex backend surfaced its JSONL only
as truncated `status` events and the ollama backend never emitted a result on a clean text
turn — so `run.output` stayed empty and there was nothing to persist. Both backends now emit
their final assistant text as an untruncated `result` event (codex extracts the final
`agent_message` across protocol shapes; ollama emits on a clean tool-less turn). Since design
stages execute via `codex-exec`, the codex path is the load-bearing fix for the local pipeline.
