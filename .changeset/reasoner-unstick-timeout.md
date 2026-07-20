---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): give the reasoner unstick advisory a generous timeout

The reasoner unstick advisory (#937) fired correctly on a stalled retry but its call
was killed by the general `intelligence.requestTimeoutMs` (90s default) — observed live
(af8): `reasoner unstick advisory skipped … "Request timed out"`. A thinking reasoner
(e.g. qwen3.6 with reasoning ON) produces its structured diagnosis in minutes, and over
Ollama's `/v1` endpoint the thinking cannot be disabled, so the model reasons well past
90s before answering. Floor the advisory's timeout at 300s (never shortening a larger
operator-configured value) so it actually delivers its guidance instead of silently
degrading to the raw retry. It only fires on a genuine stall, so the occasional
multi-minute wait is worth avoiding a needs-human escalation.
