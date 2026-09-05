---
'@harness-engineering/cli': patch
---

Fix container startup for the published `harness-cli` and `harness-mcp` images.

Both images failed to start, producing no stdout — which the Docker smoke test reported as
`Expected semver, got: ''` and `Expected serverInfo in response, got: ''`. Three independent
packaging defects, none of which could surface before the first release-path publish:

- The `cli` stage's `COPY` allowlist had drifted from the CLI's transitive workspace closure,
  omitting `burn`, `signals` and `local-models`. `pnpm install` symlinks every workspace dependency
  whether or not its directory was copied, so the miss produced dangling symlinks that were invisible
  at build time and fatal at startup with `ERR_MODULE_NOT_FOUND`.
- `typescript` is imported at runtime by the CLI and deliberately kept out of the tsup bundle, but
  was declared only as a root devDependency, so `--prod` installs excluded it. It is now a real
  runtime dependency of `packages/cli`. This adds no bytes to the container (it was already present
  transitively) and makes an existing implicit requirement explicit.
- The `cli` stage drops to `USER node` while `/app` stays root-owned, so the MCP server died with
  `EACCES` creating `/app/.harness`. The directory is now pre-created and owned by `node`, matching
  the pattern the orchestrator stage already uses for its workspaces directory.

Verified against real containers: `--version` prints `12.3.0` and the MCP server answers `initialize`
with `serverInfo`. Image size grows ~1MB.
