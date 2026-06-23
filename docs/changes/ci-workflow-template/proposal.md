# CI Workflow Template

## Overview

Adopters of harness currently write their CI from scratch, inheriting none of the
project's hard-won wisdom — the dogfood's `.github/workflows/ci.yml` lives in this
repo, not in anything an adopter receives. This is the largest "ships assembled vs
ships in pieces" gap (roadmap #540).

This change enriches harness's **existing** CI generator (`generateCIConfig` in
`packages/cli/src/commands/ci/init.ts`) so that a project running `harness init`
inherits a complete, blocking GitHub Actions workflow: build, lint, and test
(language-appropriate) followed by the consolidated `harness ci check` gate, on
every pull request and every push to `main`. There is **one** CI generator — both
`harness init` (automatic, scaffold-time) and `harness ci init` (on-demand) route
through it, so the two paths cannot drift.

**Strategic grounding** (`STRATEGY.md#our-approach`): "constraints fire in real
time, so agents self-correct mid-stream… Humans own the thinking layer; the harness
mechanically polices everything below it." A CI workflow that _stops_ a merge on
violation is that bet embodied off-repo. The primary persona
(`STRATEGY.md#who-its-for`) is the adopter 3–6 months in who already has a repo —
hence the workflow must reach existing projects, not just new scaffolds.

### Goals

- `harness init` writes `.github/workflows/ci.yml` that builds, lints, tests, and
  runs `harness ci check` as a blocking gate.
- A single GitHub Actions generator — no second YAML source that drifts.
- The workflow reaches existing-repo adopters, not only fresh scaffolds.

### Non-goals

- The required multi-persona review action — that is roadmap **#541**
  (`required-review.yml.hbs`). This workflow may reference it but does not implement it.
- A portable coverage-ratchet primitive. The dogfood ratchets coverage with a
  repo-local `scripts/coverage-ratchet.mjs`; there is no `harness` coverage primitive
  to invoke portably. Building one is out of scope (YAGNI) and a separate item if wanted.
- Language-aware enrichment of the GitLab and generic generators. GitHub is the named
  target and dominant platform; revisit on real demand.

## Decisions

| #   | Decision                                                                                                                                                                                                                          | Rationale                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Enrich `generateCIConfig`; both `harness init` and `harness ci init` route through it. No new `templates/ci/` directory.                                                                                                          | Single generator, single source. A second generator would drift — the exact entropy STRATEGY exists to prevent. Revised from an initial `templates/ci/` idea on discovering the existing command. |
| D2  | The harness-gate step is the consolidated `harness ci check` (which runs validate/deps/docs/entropy/security/perf/phase-gate/arch/traceability via `runCIChecks`), not separate `validate`/`check-arch`/`check-deps` invocations. | Already battle-tested with correct blocking exit codes (1 = checks failed, 2 = internal error). Loosely-listed individual commands in the roadmap text are superseded by the better primitive.    |
| D3  | Build/test/lint steps are language-conditional with concrete per-language defaults (TS, Python, Go, Rust, Java).                                                                                                                  | Reuses the `language` the init flow already knows; ships runnable commands, not `# TODO` placeholders.                                                                                            |
| D4  | The generated workflow excludes any auto-baseline-update / `git push` step.                                                                                                                                                       | Reproducing the dogfood's `refresh-baselines` job would embody the failure pattern roadmap #525 and `STRATEGY.md` condemn: "a harness that warns but doesn't stop is not a harness."              |
| D5  | `harness init` writes the workflow by default for new **and** existing projects, and never overwrites a workflow file that already exists.                                                                                        | Delivers "inherit on init" to the primary (existing-repo) persona; the engine's non-overwrite default (`engine.ts:323`) protects a hand-tuned workflow.                                           |
| D6  | The enriched GitHub generator writes `.github/workflows/ci.yml`; the gate-only `harness.yml` output is retired in favor of it.                                                                                                    | One canonical workflow per project. Avoids an adopter ending up with both `ci.yml` and a divergent `harness.yml`. The gate still runs — inside `ci.yml`.                                          |
| D7  | Single-job, sequential, fail-fast workflow.                                                                                                                                                                                       | The load-bearing minimum: one clear blocking pipeline an adopter immediately understands. Splitting into separate jobs only pays off once branch protection needs named status checks (YAGNI).    |

## Technical Design

### Generator: `generateGitHubActions`

**File:** `packages/cli/src/commands/ci/init.ts`

Extend the signature to accept the detected language:

```
generateGitHubActions(skipFlag: string, opts?: { language?: string }): string
```

It emits one `ci` job:

1. `actions/checkout`
2. language runtime setup (e.g. `setup-node` + `pnpm/action-setup` for TS; `setup-python` for Python; `setup-go`; `dtolnay/rust-toolchain`; `setup-java`)
3. install dependencies
4. build
5. lint
6. test
7. `harness ci check --json${skipFlag}`

Steps 2–6 are language-conditional; step 7 is universal. Triggers (`push: [main]`,
`pull_request: [main]`) and the `concurrency` cancel-in-progress block carry over
from the current generator. The job is fail-fast: a failed earlier step blocks the
gate, so a broken build never reports green.

**Per-language defaults (initial set):**

| Language             | install                         | build               | lint                | test            |
| -------------------- | ------------------------------- | ------------------- | ------------------- | --------------- |
| TypeScript / default | `pnpm i --frozen-lockfile`      | `pnpm build`        | `pnpm lint`         | `pnpm test`     |
| Python               | `pip install -e .`              | —                   | `ruff check .`      | `pytest`        |
| Go                   | `go mod download`               | `go build ./...`    | `golangci-lint run` | `go test ./...` |
| Rust                 | `cargo fetch`                   | `cargo build`       | `cargo clippy`      | `cargo test`    |
| Java                 | `mvn -B -q install -DskipTests` | (covered by verify) | —                   | `mvn -B verify` |

Unknown / unspecified language falls back to the TypeScript defaults (the engine's
existing behavior for the JS/TS path).

### Init wiring

**File:** `packages/cli/src/commands/init` (the init command flow) → `TemplateEngine`

After scaffold, the init flow calls
`generateCIConfig({ platform: detectPlatform() ?? 'github', language })` and writes
the result through the engine's non-overwrite path. The generated workflow is
classified as a harness-managed file (alongside `harness.config.json`, `AGENTS.md`)
so that existing-project mode — which today writes only harness-config files
(`engine.ts:303`) — still emits it.

**Behavioral requirements (EARS):**

- When `harness init` runs and no workflow file exists at the target path, the system
  shall write the generated CI workflow.
- If a workflow file already exists at the target path, the system shall not overwrite it.
- When `harness ci check` exits non-zero in the generated workflow, the workflow run
  shall fail.

## Integration Points

- **Entry Points:** `harness init` (new behavior — writes the CI workflow as part of
  scaffolding); `harness ci init` (existing command, now routing through the enriched
  generator).
- **Registrations Required:** None. No new command, skill, MCP tool, or barrel export.
  The change threads `language` into `generateCIConfig`'s options type and adds the
  workflow to the set of harness-managed files written in existing-project mode.
- **Documentation Updates:** `docs/standard/implementation.md` (CI now ships on init,
  not hand-written later); `harness init` / `harness ci init` command help and docs;
  AGENTS.md CI section if present.
- **Architectural Decisions:** **D1** (single-generator consolidation) warrants a
  short ADR — it establishes the precedent that scaffold-time generation and
  on-demand generation share one source rather than maintaining parallel generators.
  The remaining decisions are local to this change.
- **Knowledge Impact:** the concept "CI ships assembled on init"; the relationship
  between `harness init`, `generateCIConfig`, and `harness ci check` as the single
  blocking gate; the anti-pattern record that generated CI must not auto-update
  baselines (links #525).

## Success Criteria

1. `harness init` on a fresh project writes `.github/workflows/ci.yml` containing
   build + lint + test + `harness ci check`.
2. The workflow triggers on pull requests and pushes to `main`, and the run **fails**
   when `harness ci check` exits non-zero.
3. Language is reflected in the generated steps: a Python project runs `pytest`, a Go
   project runs `go test ./...`, a Rust project runs `cargo test`, etc.
4. Running `init` in an existing project with no workflow writes one; running it where
   a workflow already exists leaves that file untouched.
5. No auto-baseline-update or `git push` step appears anywhere in the generated workflow.
6. Exactly one GitHub Actions generator exists in the codebase — `harness init` and
   `harness ci init` produce the same `ci.yml`; no duplicated YAML string template.
7. `harness validate` passes.

## Implementation Order

1. Extend `generateCIConfig` / `generateGitHubActions` with a `language` option; add
   per-language step blocks. Unit tests: per-language snapshot of the generated YAML.
2. Enrich the GitHub generator (build/lint/test + gate, single fail-fast job, no
   baseline-refresh job); retire the gate-only `harness.yml` output in favor of `ci.yml`.
3. Wire `harness init` to call the generator with detected platform/language; classify
   the workflow as a harness-managed file so existing-project mode emits it; preserve
   non-overwrite.
4. Integration tests: new project writes `ci.yml`; existing project with a workflow
   skips; language detection drives the right steps.
5. Documentation updates.
