---
'@harness-engineering/local-models': patch
---

fix(local-models): resolve model size from /api/tags when Ollama's /api/show omits it

`OllamaInstallAdapter.inspect` required a size field from `/api/show`, but modern
Ollama omits it there (the on-disk size lives in `/api/tags`). This made every
install that relies on `inspect` — including the dashboard's Install button,
which lets `PoolManager.install` resolve the size — fail with `parse_failed`.
`inspect` now falls back to `/api/tags` for the size (keeping `/api/show`'s
digest/metadata), and only fails when the model is absent from both.
