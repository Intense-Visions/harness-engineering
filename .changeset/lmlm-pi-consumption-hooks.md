---
'@harness-engineering/orchestrator': minor
---

feat(lmlm): wire pi (LM Studio) backend into runtime feedback + warming

The pool-consumption work landed runtime feedback (LRU `lastUsedAt` + circuit
breaker) and model warming for the `local` (Ollama) backend only; the `pi`
(LM Studio / OpenAI-compatible) backend had freshness but not these. This closes
the gap so both backends behave identically:

- `PiBackend` gains `onModelUsed` / `onModelFailed` seams, fired best-effort with
  the session's resolved model on turn success / failure (or timeout). The
  orchestrator's existing `getModelUsageHooksFor` binding now flows to `pi`, so a
  completed pi turn stamps `lastUsedAt` and clears the resolver's circuit breaker,
  and a failed pi turn feeds the breaker.
- Warming now covers `pi` via `defaultWarmModelViaCompletion` — a 1-token chat
  completion that JIT-loads the model, since LM Studio has no `keep_alive`
  primitive. `local` keeps using Ollama's native `keep_alive`.

Both hooks are best-effort (a throwing hook never breaks a turn) and only fire
when a model name is resolved.
