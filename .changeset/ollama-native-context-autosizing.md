---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

OllamaBackend now drives the model over native `/api/chat` (honors `num_ctx`/`think`/`keep_alive`), autosizes `num_ctx` from the model's declared max and available hardware, sends native `think:false` for reasoning-off (retiring the `/no_think` hack), and adds optional `numCtx`/`maxContextTokens`/`numPredict`/`keepAlive` config.
