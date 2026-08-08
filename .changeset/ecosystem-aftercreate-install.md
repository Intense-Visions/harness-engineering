---
'@harness-engineering/cli': patch
---

`harness init` now scaffolds `hooks.afterCreate` in the orchestrator config from the
detected ecosystem's install command (e.g. `uv sync` for a `uv.lock` workspace,
`pnpm install` for a `pnpm-lock.yaml` workspace) instead of hardcoding
`pnpm install --prefer-offline` for every adopter. When no lockfile or manifest is
recognized at the workspace root, init now emits a single loud, non-blocking warning
that neither an install nor a verify command could be resolved (the same condition
that silently no-ops the runtime verify gate) and still exits successfully.
