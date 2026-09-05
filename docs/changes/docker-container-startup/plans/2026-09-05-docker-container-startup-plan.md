# Plan: fix Docker container startup for the CLI and MCP images

**Date:** 2026-09-05 · **Trigger:** Release run `33965602127`, job `101306280873` (`docker / smoke-test`), sha `851a5e4e` · **Tasks:** 4 · **Integration Tier:** medium

Remediation for two of the three assertion failures in the first release-path execution of the
`docker / smoke-test` job. The third (orchestrator image size) is a separate root cause and ships as
a separate PR off `main`.

## Goal

Make the published `harness-cli` and `harness-mcp` container images actually start, so that
`docker run <cli> --version` prints a semver and the MCP server answers a JSON-RPC `initialize` with
`serverInfo` — verified against real containers, not asserted.

## The failures

```
FAIL CLI --version — Expected semver, got: ''
FAIL MCP stdio initialize — Expected serverInfo in response, got: ''
```

Both report `''` because `scripts/docker-smoke-test.sh:179` and `:192` capture stdout with
`2>/dev/null || echo ""`. `''` means _the container produced no stdout_, not _it printed an empty
version_. The diagnostic was on stderr and was discarded. Per decision **F3** this plan does **not**
fix that stderr swallowing; the observability gap is filed separately. It is, however, the reason
diagnosis required a full local reproduction.

## Reproduction

The published images could not be pulled: they are private and the available token carries
`gist, read:org, repo, workflow` — no `read:packages`. Anonymous and authenticated pulls both
returned `denied`.

Reproduced against a local build after establishing it is faithful:
`git diff 851a5e4e3..HEAD -- Dockerfile packages/cli/package.json pnpm-lock.yaml` is **empty**, so the
packaging inputs at HEAD are byte-identical to the failing release. The rebuilt image reports version
`12.3.0` — the released version — confirming the same artifact.

## Root cause: three independent defects, all first-execution-only

The `docker` job is gated `if: needs.release.outputs.published == 'true'`, so it runs only on a real
changesets publish. None of these three could surface until it did.

1. **The `cli` stage's `COPY` allowlist drifted from the CLI's workspace closure.**
   The CLI's transitive workspace closure is ten packages; the stage copied seven. Missing:
   `burn`, `signals`, `local-models`. `pnpm install` creates a symlink for _every_ workspace
   dependency regardless of whether its directory was copied, so the miss produces a **dangling
   symlink** that is invisible at build time and fatal at startup:
   `ERR_MODULE_NOT_FOUND: Cannot find package '@harness-engineering/burn'`.

2. **`typescript` is imported at runtime but declared nowhere as a runtime dependency.**
   It is statically imported by several CLI sources (`naming-craft/extract/identifiers.ts:11`,
   `brand/rules/forbidden-phrases-rule.ts:18`, `security-craft/extract/signals.ts:17`, and others)
   and is deliberately excluded from the tsup bundle (`tsup.config.ts` `external: ['typescript']`,
   because bundling breaks its CommonJS `require('fs')` host). It exists only as a **root
   devDependency**, which `--prod` excludes. The tsup comment claims it is "available transitively
   via `@typescript-eslint/typescript-estree`" — false under pnpm's strict linking, which links only
   direct dependencies. It holds for npm consumers (npm auto-installs it as a peer), which is why the
   published CLI works and only the Docker `--prod` install exposes the gap.

3. **The `cli` stage drops to `USER node` without a node-writable state directory.**
   `/app` is root-owned from the build. The MCP server's `ensureHarnessGitignore` creates
   `/app/.harness` on startup and dies with `EACCES: permission denied, mkdir '/app/.harness'`.
   `--version` exits before reaching that path, which is why one image produced two different
   failures. The `orchestrator` stage already anticipates this one level down
   (`Dockerfile:118-119`); `cli` and `mcp-server` never got the equivalent for the parent.

Defects 1 and 3 are in the `Dockerfile`. Defect 2 is a manifest under-declaration; fixing it in the
Dockerfile would be a workaround, so it is fixed at its source.

## Observable Truths (Acceptance Criteria)

Verified against real containers built from this `Dockerfile`.

1. `docker run --rm <cli-image> --version 2>/dev/null` prints a semver.
   **Gate:** output matches `^[0-9]+\.[0-9]+\.[0-9]+` — observed `12.3.0`.
2. Piping a JSON-RPC `initialize` into `docker run --rm -i <mcp-image> 2>/dev/null | head -1` yields a
   response containing `"serverInfo"`.
   **Gate:** observed
   `{"result":{"protocolVersion":"2025-03-26","capabilities":{...},"serverInfo":{"name":"harness-engineering","version":"2.3.1"}},"jsonrpc":"2.0","id":1}`
3. Every workspace symlink under `packages/cli/node_modules/@harness-engineering/` resolves.
   **Gate:** no dangling entries; `/app/packages/` contains burn, signals and local-models.
4. The image does not grow materially.
   **Gate:** `/app` 544MB -> 545MB.
5. No smoke-test assertion is weakened, disabled or deleted.
   **Gate:** `scripts/docker-smoke-test.sh` is untouched by this PR.

## Progressive verification

Each fix element clears exactly one observed failure — none is speculative.

| Image state                       | `CLI --version`                            | `MCP stdio initialize` |
| --------------------------------- | ------------------------------------------ | ---------------------- |
| baseline (reproduces the release) | `''` FAIL — no `@harness-engineering/burn` | `''` FAIL              |
| + workspace COPYs                 | `''` FAIL — no `typescript`                | `''` FAIL              |
| + `typescript` dependency         | `12.3.0` **PASS**                          | `''` FAIL — EACCES     |
| + `.harness` chown (final)        | `12.3.0` **PASS**                          | `serverInfo` **PASS**  |

## Tasks

1. Add `burn`, `signals`, `local-models` (package.json + dist) to the `cli` stage COPY list, with a
   comment recording that the list must track the full transitive closure.
2. Declare `typescript` as a runtime dependency of `packages/cli`; regenerate the lockfile.
3. Pre-create `/app/.harness` owned by `node` before `USER node`.
4. Add a changeset; write the plan and session artifacts.

## Assumptions made

- **Assumption:** a local build from HEAD faithfully reproduces the published image. Justified by the
  empty diff on all three packaging inputs, and corroborated by the rebuilt CLI reporting `12.3.0`.
- **Assumption:** the defects are architecture-independent. The local build is `linux/arm64`; CI
  publishes `linux/amd64`. All three failures are module resolution, manifest declaration and POSIX
  file ownership — none is arch-sensitive. Image _sizes_ are not comparable across the two, so the
  size claim is stated as a delta (~1MB), not an absolute.
- **Assumption:** declaring `typescript` a dependency of `packages/cli` is acceptable for npm
  consumers. It adds no bytes to the container (already present transitively) and npm consumers
  already resolve it as a peer of `typescript-estree`; this makes an existing implicit requirement
  explicit.

## Deferred — NOT fixed here

- **`better-sqlite3` ships with no native binding.** `--ignore-scripts` (`Dockerfile:80`, `:147`)
  skips its `install` script, which is what fetches the prebuilt `.node`. Confirmed: no
  `better_sqlite3.node` anywhere in the image, and no `build/` under the package. This was the
  fleet's leading hypothesis for THIS red and is **refuted as its cause** — the process dies during
  module resolution and never reaches a native `require` — but the defect is real and latent. It will
  fire the moment a command touches the webhook queue or session search index
  (`packages/orchestrator/src/gateway/webhooks/queue.ts:1`,
  `packages/orchestrator/src/sessions/search-index.ts:13`). Note `--ignore-scripts` is load-bearing:
  `503fbd819` added it because the root `prepare` runs husky, a devDependency. A fix must keep husky
  skipped while letting native modules build. Out of scope for a minimal remediation; needs filing.
- **The smoke test discards stderr** on both runtime assertions (decision F3). Filed separately.
- **A build-time guard** asserting every workspace symlink resolves would have caught defect 1 in CI
  rather than in a release. Worth doing; not done here.
