---
'@harness-engineering/orchestrator': patch
---

fix(lmlm): estimate on-disk size for operator install instead of a pre-pull inspect

The Recommendations "Install" action 404'd on every model with a misleading "no longer available on HuggingFace" error. The route built the install proposal with `diskImpactGb: 0`, which drove the pool to resolve the on-disk size via `installer.inspect` (ollama `/api/show`) — a call that only succeeds for models already pulled locally, so a fresh install target always 404'd into `failed_target_missing` before the download began. The route now sizes the proposal via `estimateDiskGb` from the matched candidate (params + quant), matching the automated proposal engine, so the install proceeds to the pull.
