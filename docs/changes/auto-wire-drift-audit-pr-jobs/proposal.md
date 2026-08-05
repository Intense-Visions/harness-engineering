# Auto-wire standalone drift and audit pipelines on PRs (#664)

## Problem

Several high-value harness checks run nowhere on PRs. Roadmap #664 asks for
PR-scoped, path-filtered, **advisory (non-blocking)** CI jobs that run the
lightweight, CLI-runnable validators and surface their findings.

The item explicitly warns that the full LLM-judgment pipelines
(`design-pipeline`, `docs-pipeline`, `design-craft`) need an **agent runner**
(the `required-review.yml` `harness review-ci` pattern), not plain GitHub
Actions. Only validators that run **unaided** — no API key, no agent runner, no
network, no pre-built knowledge graph — belong in a stock Actions workflow.

## What was wired

A dedicated workflow, `.github/workflows/pr-advisory-checks.yml`, keyed on
`pull_request` to `main`. Each job path-gates itself by diffing the PR against
`origin/${{ github.base_ref }}` (mirroring `required-review.yml` /
`changeset-check`: `fetch-depth: 0` + base-ref fetch) and skips cleanly when no
relevant file changed. All validator steps run under `continue-on-error: true`,
so findings are surfaced in the log but never flip the PR status (advisory by
default; blocking is opt-in and out of scope).

| Validator                                    | Job                                                                                     | Command                                            | Why it runs unaided                                                                                                                                                                                                                                                                                                                | Local run                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **detect-design-drift** (design-token drift) | `design-drift`, gated on `**/*.{ts,tsx,js,jsx,css,scss}`                                | `align-design-system --dry-run -f <changed files>` | `align-design-system --dry-run` invokes detect-design-drift internally and reports DRIFT-T*/DRIFT-P* findings **report-only** (0 files modified). Purely rule-based: regex + TS-compiler JSX parsing over `design-system/tokens.json` + `DESIGN.md`. No LLM, no graph, no network.                                                 | exit 0, 303 suggestions repo-wide; 2 suggestions when scoped to one changed file                       |
| **detect-doc-drift** (doc drift)             | `doc-drift`, gated on docs/source (`**/*.{ts,tsx,js,jsx,md,mdx}`, `docs/`, `AGENTS.md`) | `check-docs` + `cleanup --type drift`              | The detect-doc-drift skill's Phase 1 runs exactly these two commands. `check-docs` (doc coverage) exits 0; `cleanup --type drift` does AST-based stale/renamed-symbol detection via `EntropyAnalyzer` (not the `.harness/graph`) and exits 1 on findings — handled by `continue-on-error`. No LLM, no network, no pre-built graph. | `check-docs` exit 0 (89.0% coverage); `cleanup --type drift` exit 1 with stale/renamed-symbol findings |

`check-design` (which would cover design-drift more richly) was **not** used
because it composes `design-craft`, an LLM-judgment critique that needs an agent
runtime. The `align-design-system --dry-run` path is the rule-based drift floor
the item asked for ("run ONLY the rule-based drift portion").

## What was deferred (agent-runtime required)

| Validator                                          | Why deferred                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **supply-chain-audit** (6-factor dependency risk)  | No CLI command exists (`harness supply-chain-audit` is not registered). The skill is an agent-driven process that fetches the npm registry (`registry.npmjs.org`) and the GitHub API per dependency to score maintainer concentration, maintenance status, etc. It needs **network access + agent orchestration**, so it cannot run unaided via `harness.js`. `check-deps` exists but only validates architectural layers / circular deps — it is not the supply-chain audit. |
| **test-advisor** (test-strategy / coverage advice) | No CLI command exists. The skill drives MCP tools (`canary_probe`, `query_graph`, `get_impact`, `get_relationships`, `canary_recommend_framework`) that require a **pre-built knowledge graph** (`.harness/graph/`, which is git-ignored and absent on a fresh CI checkout) plus an **MCP/agent runtime**. Not runnable unaided.                                                                                                                                              |

Both deferred validators need the agent-runtime work (the `required-review.yml`
`harness review-ci` runner pattern) before they can be wired — which is the
constraint #664 itself flags.

## Verification

- Both wired commands were run locally against this repo via
  `node packages/cli/dist/bin/harness.js …` and produce findings without any
  API key, agent runner, network, or pre-built graph.
- `align-design-system --dry-run` writes no source files (verified: clean
  `git status` after the run).
- The workflow YAML parses cleanly (`yaml.parse`); both jobs carry the correct
  `continue-on-error` advisory steps and `on.pull_request.branches: [main]`.
- CI itself cannot be exercised locally; job/step `if:` gating and the
  changed-file path filters were reviewed by hand.
