---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): unload the coder before the reasoner unstick call (free the GPU)

On a single-GPU box the coder (codex's execution model) and the reasoner can't both be
resident. The unstick's reasoner call must swap the coder out, and in a run that swap is
starved past its budget — Ollama serves one request at a time and the just-finished coder
is still resident — so the advisory timed out and was skipped every time (observed cx4–cx7),
never reaching the coder. The provider path itself is correct (verified in isolation); the
failure is purely GPU contention at the moment the advisory fires.

Before the reasoner call, explicitly unload the execution model from Ollama
(`/api/generate` with `keep_alive: 0`) so the reasoner loads into free VRAM with nothing to
evict; codex reloads the coder on the next dispatch. Best-effort and never throws.
