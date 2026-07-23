---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): give local reasoning stages an adequate deadline + capture thinking-only turns

A fully-local staged workflow left its design phase empty: the `brainstorming`/`planning`
stages ran on a local reasoning backend but produced no `proposal.md`/plan. Two causes:

1. **Deadline too short for a local reasoning model.** The per-stage wall-clock deadline
   defaulted to 120s (`DEFAULT_STAGE_DEADLINE_MS`), which is tuned for cloud models. A local
   reasoning model (e.g. qwen3 with `think:true`) spends ~30-40s per turn processing large
   contexts, so 120s aborted a design/plan stage after only ~3 turns — while it was still
   gathering context, BEFORE it wrote its spec/plan — yielding an empty artifact and cascading
   to an empty execution stage. A stage routed to a LOCAL (on-device) backend now defaults to
   `LOCAL_STAGE_DEADLINE_MS` (600s, ~15 turns of headroom); cloud stages are unchanged
   (byte-identical to the old 120s default), and an explicit `stageDeadlineMs` on the workflow
   decl still overrides both.

2. **A reasoning model's thinking-only turn was dropped.** The native `/api/chat` `thinking`
   field (a reasoning model's chain-of-thought, separate from `content`) was discarded during
   response normalization. When such a model ends a tool-less turn with empty `content` but a
   populated `thinking`, its output is now captured as the stage's `result` (falling back to
   `thinking` only when `content` is empty) instead of being lost — so the persist/thread-forward
   path has something to work with. Completion (`TASK_COMPLETE`) still keys on visible `content`.
