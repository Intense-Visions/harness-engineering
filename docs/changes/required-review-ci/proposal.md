# Ship a required-review CI gate (multi-client)

**Keywords:** required-review, github-actions, ci-template, multi-persona-review, runner-contract, multi-client, verdict-schema, block-on-threshold, heuristic-floor, branch-protection-ruleset, handlebars-template

**Roadmap:** `Ship a required-review GitHub Action template` — github:Intense-Visions/harness-engineering#541 (P0, v5.0 Load-Bearing Harness)

## Overview

Ship a multi-client, "ships-assembled" CI gate that runs the harness code-review
pipeline on every PR and **blocks merge** when the review rejects the change.
Delivered as coordinated artifacts an adopter inherits on `harness init`:

1. A tested `harness review-ci` orchestrator command (the **runner contract**) —
   logic in `packages/core`, surface in `packages/cli`.
2. A thin Handlebars workflow template `templates/ci/required-review.yml.hbs` that
   calls the command.
3. A committed GitHub **ruleset JSON** + documented `gh api` apply step that makes
   the check _required_.

**Problem** (`STRATEGY.md#tracks` — External adoption flywheel + Multi-client
portability): today the multi-persona review — the project's strongest gear — is
optional; adopters must remember to invoke it, and the dogfood's own
`.github/workflows/ci.yml` runs no code-review at all (verified: `ci.yml` runs
build/test/lint/coverage only). This is the largest "ships assembled vs ships in
pieces" gap (roadmap source: Pass 2 #6).

## Goals

1. **G1 — Tiered, always-on gate.** The client-agnostic heuristic floor
   (`runReviewPipeline`, `packages/core/src/review/pipeline-orchestrator.ts:78`)
   always runs and can block; the LLM multi-persona tier runs as a real headless
   agent session **when an auth secret is present**, degrading gracefully when
   absent.
2. **G2 — Anti-theatre enforcement.** A `block-on` threshold (default:
   request-changes/critical) makes a rejecting verdict fail the check. Green must
   mean "the review approved."
3. **G3 — Multi-client.** A normalized verdict schema + `runner` input with
   working presets for **Claude, Antigravity (`agy`), Codex, Cursor** (agent-CLI
   runners) plus **`local`** (an endpoint-based runner over an openai-compatible
   local model). Antigravity is the current Gemini-family agentic CLI; the older
   standalone `gemini` CLI is retained as a superseded runner id that points at
   `antigravity`.
4. **G4 — The check is actually required.** A config-as-code ruleset binds the
   check name in branch protection.
5. **G5 — Secret-free / cost-free option.** The `local` runner delivers
   LLM-judgment review with no API-key secret and no per-PR token cost, lowering
   the adoption barrier for a check that runs on every PR.

## Non-goals (YAGNI)

- A `harness`-native branch-protection _setter_ command — deferred; the ruleset +
  `gh api` step covers it. A CLI wrapper may come later if #540 builds the tooling.
- Non-GitHub CI providers — the `review-ci` command is provider-agnostic by
  construction, but only the GitHub wrapper ships in v1.
- Auto-remediation of findings — the gate judges; it does not fix.

## Decisions made

Formalizing the brainstorming questions (Q1–Q5) and the architecture choice.

- **D1 — Tiered execution.** Heuristic floor always runs (client-agnostic); the
  LLM tier is secret-gated and degrades gracefully. _(Q1-A)_
- **D2 — Configurable threshold.** `--block-on` defaults to request-changes/critical;
  adopters can loosen it. _(Q2-A)_
- **D3 — Per-client runner contract (two preset kinds).** A normalized
  `CiReviewVerdict` schema plus a `runner` input. The contract supports two
  preset _kinds_:
  - **`agent-cli`** — uniform headless CLI invocations the `harness review-ci`
    command shells out to (`claude -p`, `gemini`, `codex`, `cursor`), each running
    the full agentic multi-persona skill. NOT GitHub Actions — this supersedes the
    brainstorm's initial `claude-code-action` framing (chosen before multi-client
    was a requirement); `anthropics/claude-code-action` is documented as an
    _alternative_ an adopter can swap in, not the bundled default.
  - **`endpoint`** — a model-endpoint runner (`local`) that does a single LLM-judgment
    pass over the diff via the existing openai-compatible analysis provider
    (`packages/intelligence/src/analysis-provider/openai-compatible.ts`); no agent
    harness, no secret, no token cost.

  Both kinds normalize to the same `CiReviewVerdict`, so the gate/threshold logic
  is preset-kind-agnostic. _(Q3 generalized + D6 + D7)_

- **D4 — Runners in v1, feasibility-gated.** Claude + Codex + **Antigravity (`agy`)**
  ship verified (`agent-cli`), confirmed against the real CLIs via the Phase 1
  Task 10 smoke test (diff piped over STDIN). Note the envelope differs per runner:
  claude wraps the verdict in a transcript `.result` string, codex in a JSONL
  `agent_message.text` (both two-stage), while **antigravity `agy --print` emits the
  verdict as plain-text JSON directly (single-stage)**. The following are
  `[UNVERIFIED]` and each gated behind its own Phase 1/CI spike — no
  silently-broken preset ships: **Gemini** (`agent-cli`, superseded by Antigravity;
  downgraded to
  `supported:false`: argv corrected from `--help` to `gemini -p <instr> -o json`
  with the diff on STDIN, but the output envelope is UNVERIFIED because no
  `GEMINI_API_KEY` was available locally — the CLI fell through to interactive
  OAuth; verification deferred to CI); Cursor headless-CI (`agent-cli`); `local`
  single-pass (needs a running openai-compatible endpoint, absent in the
  authoring environment); **full-agentic `local`** (a local model driving
  tool-use/subagent dispatch — the highest-risk item; small models may not
  drive the agentic pipeline reliably). _(Q4-A + D7; revised by Task 10 smoke
  test divergence)_
- **D5 — Config-as-code ruleset.** Committed `required-review.ruleset.json` + a
  documented one-line `gh api` apply step makes the check required. _(Q5-A)_
- **D6 — Orchestration in tested TS.** The contract (floor reuse, per-runner
  normalization, threshold, exit codes) lives in `packages/core`, exposed via a
  `harness review-ci` command — not smeared across adopter YAML. Verdict
  normalization across heterogeneous client outputs is the load-bearing,
  error-prone seam and belongs in the most testable layer. _(Approach 3)_
- **D7 — `local` runner, dual-mode.** Add a `local` runner backed by the harness's
  existing local-model / openai-compatible provider. Ship the **single-pass**
  endpoint mode first (deterministic, testable, secret-free, cost-free — G5).
  Additionally **attempt full-agentic local** (a local model driving the
  multi-persona skill); because small local models may not drive tool-use/subagent
  dispatch reliably, this is gated behind a dedicated spike and is NOT promised
  until that spike passes. _(human decision: "consider local LLM" → option B)_
- **D8 — Antigravity (`agy`) is the Gemini-family runner.** Per the runtime
  rename, the Gemini agentic CLI is now Antigravity (`agy`). The `antigravity`
  runner (`agy --print`, diff on STDIN, single-stage plain-text-JSON parser) ships
  verified — it authenticated locally where the older `gemini` CLI did not. The
  `gemini` runner id is retained as `supported:false` with `unsupportedReason`
  pointing adopters to `antigravity`. _(human correction: "gemini is now
  antigravity cli, command is agy")_

  Together D7 and D8 honor the repo's existing provider architecture
  (anthropic / openai / local-model) and the Multi-client-portability strategy
  track.

## Technical design

### Component A — `harness review-ci` orchestrator (the contract)

New command in `packages/cli/src/commands/`; orchestration + normalization logic
in `packages/core/src/review/ci/` (testable, reuses the existing pipeline).

Interface:

```
harness review-ci
  --runner   claude | gemini | codex | cursor   (omit = floor-only)
  --block-on critical | request-changes | none   (default: request-changes)
  --diff     <git range>                          (default: origin/<base>...HEAD)
  --comment                                       (post verdict as a PR review)
  --json     <path>                               (emit the verdict artifact)
```

Execution order:

1. **Floor** — call `runReviewPipeline({ flags: { ci: true } })`
   (`pipeline-orchestrator.ts:78`). Mechanical-stop or heuristic findings already
   produce `exitCode` + `assessment` — reuse verbatim. Floor mechanical failure
   short-circuits (never spend LLM tokens on a diff that fails mechanical checks —
   matches the pipeline's own Phase-2 stop).
2. **LLM tier** — if `--runner` set _and_ that runner's auth secret is present:
   shell out to the runner's headless CLI preset, which runs the harness
   `code-review` skill and writes its verdict to a known path. If the secret is
   absent: log a clear "LLM tier skipped (no secret) — floor-only" line and
   continue (graceful degradation per
   `docs/knowledge/intelligence/failure-modes.md`).
3. **Normalize** — map the runner's raw output into the `CiReviewVerdict` schema.
   This is the load-bearing, fully unit-tested seam.
4. **Threshold** — fail (`exitCode 1`) iff `verdict.assessment` meets/exceeds
   `--block-on`, OR the review failed to execute when a runner was required.
5. **Report** — `--comment` posts the normalized verdict as a single PR review;
   `--json` writes the artifact.

### `CiReviewVerdict` schema

Zod schema in core; the normalization target every runner maps to:

```
{
  schemaVersion: 1,
  runner: 'claude' | 'gemini' | 'antigravity' | 'codex' | 'cursor' | 'local' | 'floor-only',
  ranLlmTier: boolean,
  assessment: 'approve' | 'comment' | 'request-changes',
  findings: ReviewFinding[],          // reuse existing core ReviewFinding type
  blockingFindings: ReviewFinding[],
  exitCode: number,
  skipped: boolean,
  skipReason?: string
}
```

### Per-runner preset registry

A typed registry in `packages/core/src/review/ci/runner-presets.ts`. A preset is a
discriminated union on `kind`:

- `kind: 'agent-cli'` — `{ secretEnvVar, headlessInvocation, verdictParser, supported }`
  (claude, gemini, codex, cursor).
- `kind: 'endpoint'` — `{ endpointEnvVar, modelEnvVar, invoke, verdictParser, supported }`
  where `invoke` calls the openai-compatible analysis provider against the local
  endpoint (`local`).

Both kinds expose `verdictParser` and normalize to the same `CiReviewVerdict`, so
the threshold/gate logic never branches on kind. Adding a runner = one registry
entry + tests, no template change.

**[IMPORTANT]** `[UNVERIFIED]` presets — each gated behind its Phase 1 spike before
being marked `supported`, so no silently-broken preset ships:

- **Codex / Cursor** (`agent-cli`) — headless-CI invocation + parseable verdict.
- **`local` single-pass** (`endpoint`) — needs a running openai-compatible endpoint
  (absent in the authoring environment); deterministic parts (registry entry,
  parser, unit tests) are built now, live verification deferred.
- **Full-agentic `local`** — highest risk; a separate spike confirms whether a local
  model can drive the multi-persona tool-use/subagent dispatch at all. Not promised
  until it passes.

### Component B — `templates/ci/required-review.yml.hbs`

Thin workflow: checkout → setup-node → install pinned `@harness-engineering/cli` →
conditionally expose the selected runner's secret as env →
`harness review-ci --runner {{runner}} --block-on {{blockOn}} --comment`.
Handlebars vars: `runner` (default `claude`), `blockOn` (default
`request-changes`), `baseBranch`. Registered in the template manifest
(`packages/cli/src/templates/`) so `harness init` renders it.

### Component C — `templates/ci/required-review.ruleset.json` + README

A committed GitHub ruleset JSON plus `templates/ci/README.md` documenting the
one-line `gh api repos/{owner}/{repo}/rulesets` apply. The ruleset references the
workflow's emitted check name; the spec pins that the check name in the ruleset
MUST match the workflow job name (asserted by a test that parses both files).

## Integration points

- **Entry Points:** new CLI command `harness review-ci`; new template dir
  `templates/ci/`; first committed CI artifacts for adopters. No new MCP tool in
  v1 (the command is the surface; an MCP wrapper can follow if autopilot needs it).
- **Registrations Required:** register `review-ci` in the CLI command index/barrel;
  register `templates/ci/` in the template manifest; wire into the "load-bearing
  minimum" tier (#539) once it lands; regenerate plugin/command/doc artifacts (the
  repo's `generate:plugin` / `generate-docs --check` gates run in `ci.yml`).
- **Documentation Updates:** AGENTS.md (new command); `docs/standard/` adoption
  guide (turning on the required review); `templates/ci/README.md` (ruleset apply +
  per-runner secret names).
- **Architectural Decisions:** **D3** (runner contract / `CiReviewVerdict`) warrants
  a standalone ADR — a durable cross-client interface other tooling (#540,
  autopilot) will bind to. **D6** (orchestration-in-core vs adopter YAML) warrants a
  short ADR — it sets precedent for where CI logic lives. D1/D2/D4/D5 are
  config/scoping, not ADR-worthy.
- **Knowledge Impact:** new graph concepts — _CI Review Contract_ (`CiReviewVerdict`,
  runner-preset registry), _Tiered Review Degradation_ (floor vs LLM tier),
  _Required-Check Binding_ (config-as-code ruleset). Relate to existing
  `docs/knowledge/core/code-review-pipeline.md`.

## Success criteria

1. **SC1 — Floor always gates.** `harness review-ci` with no `--runner` runs the
   heuristic floor and exits non-zero on a mechanical failure or a heuristic
   finding ≥ `block-on`; clean diff exits 0.
2. **SC2 — LLM tier secret-gated + graceful.** With `--runner claude` and the
   secret set, LLM personas contribute findings. With the secret absent, the
   command logs "LLM tier skipped — floor-only", still runs the floor, and does
   not error on the missing secret.
3. **SC3 — Anti-theatre threshold.** A normalized `request-changes` verdict exits
   non-zero under default `block-on`; the same verdict exits 0 under
   `--block-on none`.
4. **SC4 — Verdict normalization.** Each runner's raw output (both preset kinds)
   maps to a schema-valid `CiReviewVerdict` (unit tests per runner against captured
   fixtures). Schema is versioned.
5. **SC5 — Multi-client verified.** Claude + Codex + Antigravity (`agent-cli`) are
   verified locally against the real CLIs (diff piped over STDIN) and emit a parseable
   verdict. Gemini (`agent-cli`, SUPERSEDED by `antigravity` — the renamed `gemini`
   CLI, command `agy`) and Cursor (`agent-cli`) and `local` (`endpoint`, single-pass)
   either pass the same bar OR are explicitly marked unsupported/deferred with the
   blocking reason (no silently-broken preset ships).
   5a. **SC5a — `local` single-pass.** With a reachable openai-compatible endpoint,
   `--runner local` produces a schema-valid `CiReviewVerdict` with no API-key secret
   and no token cost (G5). Verified against a running endpoint; deterministic parts
   unit-tested without one.
   5b. **SC5b — Full-agentic `local` spike.** A spike determines whether a local model
   can drive the multi-persona tool-use/subagent pipeline. Result is a recorded
   go/no-go; the agentic-local path ships only on "go".
6. **SC6 — Required binding.** Applying `required-review.ruleset.json` via the
   documented `gh api` step makes the workflow's check a required status check; the
   check name in the ruleset matches the workflow job name (asserted by a test
   parsing both files).
7. **SC7 — Inheritable.** `harness init` renders `required-review.yml.hbs` with
   substituted `runner`/`blockOn`/`baseBranch`; `harness validate` passes on the
   scaffolded output.
8. **SC8 — Dogfood.** The harness repo's own `.github/workflows/` adopts the gate
   (the dogfood runs the gear it ships) — wired non-blocking first, then promoted
   to required once stable.

## Implementation order

- **Phase 1 — Runner-contract feasibility spike + schema.** Define `CiReviewVerdict`
  (Zod) and the two-kind runner-preset registry (`agent-cli` + `endpoint`). Build
  presets for claude/gemini/codex (`agent-cli`) and `local` single-pass
  (`endpoint`); cursor as `supported:false`. Verify runners' invocation + parseable
  output (SC5 gate) for what's locally reachable; defer in-CI + endpoint-dependent
  verification. Output: per-runner go/no-go + captured verdict fixtures.
- **Phase 1b — Full-agentic `local` spike (deferred).** Determine whether a local
  model can drive the multi-persona tool-use/subagent pipeline (SC5b). Recorded
  go/no-go; gates whether the agentic-local path ships.
- **Phase 2 — Core orchestrator.** `packages/core/src/review/ci/` — floor reuse,
  per-runner normalization, threshold logic, exit codes. Full unit coverage
  (SC1–SC4).
- **Phase 3 — CLI command.** Wire `harness review-ci`; register in command index;
  AGENTS.md.
- **Phase 4 — Templates + ruleset.** `required-review.yml.hbs`,
  `required-review.ruleset.json`, `templates/ci/README.md`; register in template
  manifest; init-render test (SC6, SC7).
- **Phase 5 — Dogfood + docs.** Adopt in this repo's workflows (SC8); adoption
  guide; knowledge-graph entries; ADRs for D3 + D6.
