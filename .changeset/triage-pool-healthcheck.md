---
'@harness-engineering/intelligence': patch
'@harness-engineering/cli': patch
---

fix(triage): health-check the pool model pick + reject truncated native output

Two silent-degradation fixes surfaced by an adversarial review of the local-model path:

- **Pool pick now health-checks against the endpoint's `/v1/models`** (`triage-pool.ts`). Before,
  the CLI returned the top-ranked `pool.json` entry without verifying the endpoint serves it — so
  a model `ollama rm`'d out-of-band, or a pool copied onto a host whose `pi` endpoint is
  vLLM/LM-Studio (different model ids), got baked in as the model, every LLM lever 404'd, and the
  report silently fell back to the static path while _claiming_ a model ran. It now picks the
  highest-ranked candidate the endpoint actually serves and otherwise falls back to the config
  list — true parity with the live `LocalModelResolver` (rank, then intersect with the probe).
  Also guards a corrupt empty-string `ollamaName`.

- **Native `think:false` path rejects truncated output** (`openai-compatible.ts`). It now throws
  on Ollama's `done_reason: 'length'` (mirroring the compat path's `finish_reason === 'length'`
  guard) so a `format`-constrained partial-but-parseable body isn't returned as complete — it
  falls back to the compat path instead. Added tests for the native fallback branches
  (truncation, schema-invalid body, missing content).
