# Honor persona-declared triggers — emit and commit persona CI workflows

**Roadmap:** #663 — Honor persona-declared triggers (emit and commit persona CI workflows and scheduled jobs)

## Problem

Persona YAMLs (`agents/personas/*.yaml`) declare `on_pr` / `on_commit` /
`scheduled(cron)` triggers and opt in via `outputs.ci-workflow: true`, and a
generator exists (`packages/cli/src/persona/generators/ci-workflow.ts`). But
**no generated persona workflow was ever committed** and nothing honored the
triggers — they were dead declarations. The project's strongest gear (the
`harness-pm` acceptance-eval gate, the scheduled health/graph/entropy sweeps,
the on-PR deep security review) was opt-in, requiring a human to remember to
invoke each persona.

## What ships

1. **Committed persona workflows.** `.github/workflows/persona-<slug>.yml` is
   generated and committed for every persona that (a) sets
   `outputs.ci-workflow: true`, (b) declares a CI-firing trigger
   (`on_pr` / `on_commit` / `scheduled`), and (c) has at least one runnable
   command step. Eleven personas qualify: architecture-enforcer, code-reviewer,
   codebase-health-analyst, documentation-maintainer, entropy-cleaner,
   graph-maintainer, harness-pm, parallel-coordinator, performance-guardian,
   security-reviewer, task-executor.

2. **Runnable + advisory.** The generator gains a `runner: 'workspace'` mode
   (invokes `node packages/cli/dist/bin/harness.js` after `pnpm install` +
   `pnpm build`, node 22, full git history) and an `advisory` mode
   (`continue-on-error: true`). The committed workflows use both, so the
   persona jobs honor their triggers **without blocking** — matching how
   `required-review.yml` and `pr-advisory-checks.yml` were introduced. The
   adopter-facing default (`npx harness`, node 20, blocking) is unchanged.

3. **Drift guard.** `pnpm generate:persona-workflows:check` (wired into
   `ci.yml`, mirroring `generate:plugin:check`) fails when a persona's declared
   trigger has a missing, stale, or orphaned committed workflow. The same check
   also runs as an in-suite vitest drift guard. `pnpm generate:persona-workflows`
   regenerates; `harness persona sync-workflows [--check]` is the underlying CLI.

## Scope boundary — command tier vs agent-runtime tier

The generator emits **only command steps**; it drops skill steps because those
require an LLM/agent runner. So these workflows are the **advisory CLI-command
tier**. The persona's LLM-judgment steps — `harness-pm`'s `acceptance-eval`,
`security-reviewer`/`code-reviewer`'s deep review — are **not** in these
workflows. They are delivered by the established `required-review.yml`
`harness review-ci` agent-runtime path, which degrades to the heuristic floor
when `ANTHROPIC_API_KEY` is unset.

Concretely: `harness-pm`'s committed workflow runs `harness validate` on
`docs/changes/**` PRs (honoring the trigger at the CLI tier), but its
`acceptance-eval` LLM judgment remains agent-runtime and is **deferred** — there
is no unaided `harness acceptance-eval` CLI to wire, so committing an
LLM-dependent job here would either hard-fail or need infra this change does not
provide. This mirrors the split already drawn by #664 (`pr-advisory-checks.yml`).

## Acceptance criteria

- `.github/workflows/persona-*.yml` exists for each persona whose CI tier adds
  value beyond `harness ci check` (a scheduled sweep, or a command outside the
  `ci check` aggregate), each valid GitHub Actions YAML, advisory
  (`continue-on-error: true`), invoking the workspace CLI after a build.
  (observable: files committed + YAML parses)
- Every emitted command step is one the target command actually accepts —
  `--severity` is appended only to commands that declare it. (observable: unit
  tests assert `check-deps` bare vs `validate --severity`; no `unknown option`)
- `pnpm generate:persona-workflows:check` exits 0 on a fresh generation and
  non-zero when a persona is added/edited without regenerating. (observable: CI
  step + unit tests for missing/stale/orphaned drift)
- `harness persona sync-workflows` is adopter-usable: defaults to the published
  CLI via `npx` (no `pnpm build`, no `dist` bin path) with a portable header, and
  refuses to run when the project has no `agents/personas/` (never writes the
  bundled personas into `node_modules`). `--runner workspace --advisory`
  reproduces this repo's dogfood shape. (observable: command tests)

## Corrections (rework of the initial cut)

The first cut shipped 11 workflows that were mostly non-functional or redundant.
Fixed here:

1. **Blocking bug:** the generator appended `--severity` to every command, but
   only `validate` / `check-perf` / `check-security` accept it — the rest
   hard-errored (`unknown option`), and job-level `continue-on-error` then
   skipped all later steps. `--severity` is now applied per-command.
2. **Redundancy:** personas whose only command steps duplicate `harness ci
check` (already run on every PR via `harness.yml`) no longer get a workflow.
   This dropped the pure-duplicate PR personas; the remaining set each runs a
   scheduled sweep or a command outside the `ci check` aggregate.
3. **Adopter usability:** the command hardcoded the dogfood runner
   (`workspace` + `pnpm build` + the `dist` bin path) and silently resolved to
   the CLI's bundled personas when a project had none. It now defaults to the
   `npx` runner with a portable header, exposes `--runner`/`--advisory`, and
   refuses the bundled-personas fallback.

Deferred follow-up: collapsing the shared setup into a `workflow_call` reusable
workflow. A job matrix cannot express the personas' heterogeneous triggers, so
that is a separate refactor; the redundancy cut already reduced the file count.

## Non-goals

- Wiring the LLM/agent-runtime tier for review personas (owned by
  `required-review.yml`; acceptance-eval CLI wiring is future work).
- Promoting any persona job from advisory to a required check.
- Changing persona semantics or trigger declarations.
