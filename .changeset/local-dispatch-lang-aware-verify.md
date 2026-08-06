---
'@harness-engineering/orchestrator': minor
---

Make the local-dispatch enforced verify gate language-aware.

The local gate's default verify runner shelled out to `pnpm -w run …`
unconditionally, so verification failed environmentally for every non-JS
workspace (pnpm absent / no `package.json`) and blocked the dispatch for a
reason unrelated to the change under test. A new pure ecosystem detector
(`detectEcosystem` / `detectEcosystemFromFiles`) classifies a workspace from the
lockfiles/manifests present — pnpm/npm/yarn (node), uv/poetry/pipenv/pip
(python), cargo (rust), go, bundler (ruby), maven/gradle (java) — in a
deterministic priority order, and returns both the dependency-install command
(for scaffolding a matching `hooks.afterCreate`) and the ordered verify command
set. The verify runner now dispatches a non-node workspace to its own toolchain
(e.g. `pytest`, `cargo test`, `go test ./...`) while preserving the existing
pnpm-scoped, changed-package behavior for node workspaces. An unrecognized
workspace remains a clean pass (nothing to check). Every choice stays overridable
via config.
