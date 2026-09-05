# Session state: Docker container-startup remediation

**Fleet:** cicd-fleet · **Item:** R2b · **Date:** 2026-09-05 · **Pipeline:** harness-debugging
**Branch:** `fleet/cicd-container-startup` · **Base:** `origin/main` @ `5cd661d74`

## Trigger

Release run `33965602127`, job `101306280873` (`docker / smoke-test`), sha `851a5e4e`.
Cause classification: **real-failure**, first-execution exposure of a latent packaging defect.

| #   | Assertion                                             | This session        |
| --- | ----------------------------------------------------- | ------------------- |
| 1   | `Orchestrator image size — 815MB exceeds 800MB limit` | out of scope (PR-A) |
| 2   | `CLI --version — Expected semver, got: ''`            | **in scope**        |
| 3   | `MCP stdio initialize — Expected serverInfo, got: ''` | **in scope**        |

## Phase log

- **INVESTIGATE** — established that `''` means "no stdout", not "empty version"
  (`scripts/docker-smoke-test.sh:179`, `:192`). Attempted to pull the published artifacts; blocked by
  a missing `read:packages` scope. Proved a local build is a faithful reproduction via an empty
  `git diff 851a5e4e3..HEAD` across `Dockerfile`, `packages/cli/package.json` and `pnpm-lock.yaml`,
  then reproduced and captured the stderr the smoke test had discarded.
- **ANALYZE** — computed the CLI's transitive workspace closure from the manifests (10 packages) and
  compared it to the stage's COPY list (7). Enumerated all 52 bare specifiers in `packages/cli/dist`
  and resolution-tested each root inside the image, rather than discovering gaps one rebuild at a
  time. Read `tsup.config.ts` to establish which packages are bundled vs external.
- **HYPOTHESIZE** — four hypotheses, tested one variable per rebuild. H1 (the fleet's supplied
  `better-sqlite3` hypothesis) **refuted**; H2, H3, H4 confirmed. See the table below.
- **FIX** — three changes, each clearing exactly one observed failure.

## Hypothesis ledger

| #   | Hypothesis                                                                         | Verdict              | Evidence                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | `better-sqlite3` native binding missing (`--ignore-scripts`) kills startup         | **REFUTED as cause** | Process dies during ESM resolution on `@harness-engineering/burn`, never reaching a native require. The missing binding is real but latent — recorded as deferred. |
| H2  | `cli` stage COPY allowlist drifted from the workspace closure -> dangling symlinks | CONFIRMED            | `burn`, `signals`, `local-models` symlinked but never copied                                                                                                       |
| H3  | `typescript` imported at runtime but not a declared runtime dep                    | CONFIRMED            | Root devDependency only; `--prod` excludes it; tsup keeps it external                                                                                              |
| H4  | `USER node` with a root-owned `/app` blocks state-dir creation                     | CONFIRMED            | `EACCES: permission denied, mkdir '/app/.harness'`                                                                                                                 |

## Verification

Real containers, exact CI assertions. `12.3.0` is the released version, confirming artifact identity.

| Image state        | `--version`   | MCP `initialize`  |
| ------------------ | ------------- | ----------------- |
| baseline           | `''` FAIL     | `''` FAIL         |
| + workspace COPYs  | `''` FAIL     | `''` FAIL         |
| + `typescript` dep | `12.3.0` PASS | `''` FAIL         |
| final              | `12.3.0` PASS | `serverInfo` PASS |

Size delta: `/app` 544MB -> 545MB.

## Human decisions carried into this session

- **F2 -> (b)** two PRs off `main`, not stacked. This branch is cut from `origin/main` and does not
  contain PR-A's commit.
- **F3 -> (b)** the smoke test's `2>/dev/null` stderr swallowing is **not** fixed here. Stderr was
  read locally for diagnosis only; `scripts/docker-smoke-test.sh` is untouched by this PR.

## Constraints honoured

- No assertion weakened, disabled or deleted — the fix is entirely on the packaging side.
- No `--no-verify`. No merge.

## Status

`resolved` — session record at `.harness/debug/active/docker-container-startup.md` (gitignored path;
mirrored here because `.harness/debug/` is excluded by `.gitignore:49`).
