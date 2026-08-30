---
number: 0111
title: Tiered end-to-end testing framework on the existing vitest + canary stack
date: 2026-08-30
status: accepted
tier: large
source: 'decision-blocked issue #1691'
---

## Context

The repo has strong UNIT coverage but almost no true END-TO-END coverage. Unit
tests mock the boundaries — `node:child_process.spawn`, network, MCP transport,
git, real file IO — so an entire class of failure is invisible: the behavior of
the REAL external tool. The motivating bug (#1558) is exact: the `claude` CLI
sometimes narrates ("I've already called the StructuredOutput tool…") and omits
`structured_output`. Every unit test mocked `spawn`, so none exercised the real
envelope; only a live `harness comprehend` run surfaced it. We patched it and
added real-fixture tests, but the pattern was reactive, not systemic.

An embryonic E2E convention already exists in the tree — it is simply
undocumented, unnamed, and not adopted by default:

- `packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts` already drives
  the REAL built `dist/bin/harness.js` as a subprocess against a REAL scaffolded
  git repo, asserts on-disk output + exit codes, gates on artifact presence with
  `describe.skipIf(!HAS_BIN)`, and carries a gated live variant behind
  `HARNESS_E2E_LIVE=1`. That single file is a de-facto Tier A + Tier B + Tier C.
- `packages/orchestrator/tests/e2e/telemetry-otel-collector.e2e.test.ts` and
  `packages/core/tests/roadmap/tracker/adapters/github-issues.e2e.test.ts`
  (env-gated via `skipIf`) are more of the same, invented independently.
- Fixtures already live at the repo-root `fixtures/` and per-package
  `tests/fixtures/`, but with no shared convention for captured tool envelopes.

The stack is uniform and load-bearing: vitest is the runner in every package
(root `vitest.config.mts` plus a `vitest.config.mts` per package), CI runs
`test:ci` → `turbo run test:coverage`, and there is no Playwright anywhere in the
tree despite a `packages/dashboard`. Canary is already integrated as the
test-suite plugin: canary MCP tools live at `packages/cli/src/mcp/tools/canary.ts`
(`canary_discover_test_command`, `canary_probe`, `canary_recommend_framework`,
`canary_run_history`) and canary review hooks at
`packages/core/src/hooks/canary-review-hooks.ts`. `.github/workflows/main-health.yml`
already runs on a `schedule:` cron — a ready home for a nightly gated lane.

The question is whether to formalize the pattern already emerging on the current
stack, or to introduce a dedicated new E2E framework (e.g. Playwright as the
primary driver) across the whole repo.

## Decision

Adopt a **tiered E2E framework built on the existing vitest + canary stack**,
codifying the convention that `comprehend-smoke.e2e.test.ts` already discovered
rather than importing a new one. Three tiers, distinguished by the boundary they
exercise and their CI cadence:

- **Tier A — deterministic real-boundary integration (per-PR, CI-safe).** Real
  subprocess / git / file / MCP IO against hermetic fixtures and real temp git
  repos, with the boundary under test NEVER mocked and no live network/LLM.
  Real external-tool behavior is reproduced from captured artifacts (starting
  with the #1558 `claude`-CLI envelopes). Runs green on every PR inside the
  existing `turbo run test:coverage`.
- **Tier B — gated live smoke (nightly / dogfood).** Real `claude` CLI, real
  orchestrator dispatch, real MCP round-trips, real analysis-provider path.
  Opt-in via env/credential gates (`HARNESS_E2E_LIVE=1`, `skipIf` on missing
  `claude` / API key / docker) so it is a no-op on PRs and on contributor
  machines, and wired into the existing `main-health.yml` nightly cron.
- **Tier C — CLI smoke (per-PR, CI-safe).** Invoke `harness <cmd>` as a real
  subprocess (`process.execPath` + the built `.js` entry, never the `.bin` shim —
  win32-safe, per the existing file) against a scaffolded temp project, asserting
  on-disk output and honest exit codes.

Concrete shape, all on the current stack:

- **Naming + discovery:** the `*.e2e.test.ts` suffix is the tier marker; tests
  live beside their package (`packages/<pkg>/tests/**`), discovered by the
  existing per-package vitest config — no separate runner or project graph.
- **Shared helpers:** extract the temp-project / temp-git scaffold and the
  win32-safe subprocess spawner (currently inline in the comprehend smoke test)
  into one reusable test helper so new E2E tests are cheap to add.
- **Fixture convention:** a documented `fixtures/` layout for captured real tool
  outputs (seeded with the #1558 `claude`-CLI envelopes) that Tier A replays.
- **Gate:** a shared `skipIf`-capable env gate for Tier B, plus the nightly lane
  in `main-health.yml`.
- **Orchestration:** drive suite selection/health through canary
  (`canary_discover_test_command`, `canary_run_history`) rather than a bespoke
  runner, keeping the plugin as the single test-suite front door.
- **Docs + adoption:** a "how to add an E2E test" doc making Tier A/C the default
  for new user-facing flows, with candidate first flows from #1691 (comprehension
  compile→serve hash-equality; orchestrator dispatch→gate→completion; MCP tool
  registration + round-trips; the analysis-provider live path as Tier B).

Playwright stays scoped **strictly** to the browser/dashboard flows where it
actually applies; it is not the project-wide E2E driver.

> **Assumptions made.** This tiered-on-existing-stack default was taken
> autonomously during a decision-blocked `adr-fleet` DISPATCH, without a live
> human fork answer. The load-bearing assumption is that the motivating bug class
> is _real external-tool behavior_ (subprocess/git/MCP/network), not browser-UI
> behavior — so the highest-leverage framework is real-boundary integration on the
> runner we already have, and a heavy new browser-first driver would be redundant
> for that class. If a future audit shows the dominant untested risk is actually
> in the dashboard UI, Tier scoping should be revisited.

## Consequences

Positive:

- Directly targets the #1558 bug class: the boundary under test is never mocked,
  so real-tool misbehavior (narration, omitted fields, nonzero exits) is caught.
- Zero new primary framework, zero new runner: reuses vitest, turbo, `skipIf`,
  the existing fixtures dirs, and canary — incrementally adoptable one flow at a
  time, starting from a pattern already proven in-tree.
- Tier A/C stay per-PR and deterministic (no flaky live deps in the PR gate);
  live cost and nondeterminism are quarantined to the opt-in nightly Tier B.
- Canary remains the single test-suite orchestration surface, consistent with the
  existing plugin integration.

Negative / costs:

- Tier B's value depends on the nightly lane actually running and being watched;
  a silently-skipped gated suite provides false comfort (mitigate: assert the
  gate's own reachability in `main-health.yml`, not just the tests behind it).
- Real-boundary tests are slower and heavier (temp git repos, real subprocesses)
  than mocked unit tests; the shared scaffold helper must keep per-test setup
  cheap or E2E adoption stalls.
- Captured fixtures (e.g. `claude`-CLI envelopes) can drift from real tool
  behavior over time; Tier B is the backstop that detects that drift, so letting
  Tier B rot silently re-opens the exact #1558 gap.

Neutral:

- Existing ad-hoc `*.e2e.test.ts` files are retroactively "the framework" and
  migrate to the shared helpers rather than being rewritten.
- Dashboard/browser E2E remains a separate, Playwright-shaped concern under this
  tier model, not blocked by it.

## Alternatives Considered

1. **Adopt Playwright as the primary E2E driver everywhere (rejected).**
   Playwright is browser-automation-first; the motivating failures are
   subprocess/CLI/MCP/git, none of which Playwright models better than vitest +
   real `spawn`. It would add a second runner and CI lane, duplicate the harness
   we already have in `comprehend-smoke.e2e.test.ts`, and still need a non-browser
   shim for the very flows that matter. Reserved for dashboard flows only.

2. **Do nothing / keep adding one-off fixture tests reactively (rejected).**
   This is the status quo that let #1558 through. Each fix is bug-specific, there
   is no default for new features, no shared scaffold, and no live-drift backstop
   — the class of bug stays structurally invisible.

3. **A dedicated bespoke E2E harness package (rejected as premature).**
   A new `@harness-engineering/e2e` runner/orchestrator is more infrastructure
   than the problem warrants when vitest + canary already cover discovery,
   execution, gating, and history. Revisit only if the shared-helper approach
   proves insufficient.

## References

- Issue #1691 — "Establish a project-wide end-to-end (E2E) testing framework"
  (problem statement, proposed tiers A/B/C, candidate first flows, success
  criteria).
- Issue #1558 — the `claude`-CLI chatty structured-output miss that only a live
  run surfaced; the motivating bug class.
- `packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts` — the in-tree
  precedent: real built-binary subprocess, real temp git repo, `skipIf` artifact
  gate, and a `HARNESS_E2E_LIVE=1` gated live variant.
- `packages/orchestrator/tests/e2e/telemetry-otel-collector.e2e.test.ts`,
  `packages/core/tests/roadmap/tracker/adapters/github-issues.e2e.test.ts` —
  independently-invented E2E/gated-live tests to be unified.
- `packages/cli/src/mcp/tools/canary.ts` — canary MCP test tools
  (`canary_discover_test_command`, `canary_probe`, `canary_recommend_framework`,
  `canary_run_history`); `packages/core/src/hooks/canary-review-hooks.ts`.
- Root `vitest.config.mts` and per-package `vitest.config.mts`; `test:ci` →
  `turbo run test:coverage`; `.github/workflows/main-health.yml` (nightly cron
  home for Tier B); repo-root `fixtures/` and per-package `tests/fixtures/`.
- ADR 0106 (claude-CLI analysis-provider) and ADR 0107/0108 (comprehension
  substrate) — the flows named as candidate first E2E targets.
