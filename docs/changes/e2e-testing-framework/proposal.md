# Proposal: Project-wide tiered E2E testing framework

- **Issue:** #1691 — "Establish a project-wide end-to-end (E2E) testing framework"
- **Route:** feature (harness-brainstorming → harness-autopilot)
- **Decision of record:** ADR 0111 — `docs/knowledge/decisions/0111-project-wide-e2e-testing-framework.md`
  (status: accepted; source: "decision-blocked issue #1691")
- **Delivery:** first slice — see "Scope of this slice" below. PR closes/refs decision at the bottom.

## Problem

The repo has strong UNIT coverage but almost no true END-TO-END coverage. Unit
tests mock the boundaries — `node:child_process.spawn`, network, MCP transport,
git, real file IO — so an entire class of failure is structurally invisible: the
behavior of the REAL external tool. The motivating bug (#1558) is exact — the
`claude` CLI sometimes narrates ("I've already called the StructuredOutput
tool…") and omits `structured_output`; every unit test mocked `spawn`, so none
exercised the real envelope. Only a live `harness comprehend` run surfaced it.

## Scoping decision (resolved BEFORE design — the load-bearing finding)

**The framework substantially already EXISTS in an ad-hoc, undocumented,
un-unified form. This ticket FORMALIZES and UNIFIES it; it does NOT build a
greenfield system.** Concretely, the inventory found:

- `packages/cli/tests/comprehension/comprehend-smoke.e2e.test.ts` (527 lines) is
  already a de-facto **Tier A + Tier B + Tier C** in one file: it drives the REAL
  built `dist/bin/harness.js` as a subprocess (win32-safe `process.execPath` + the
  `.js` entry, never the `.bin` shim), against a REAL scaffolded temp git repo,
  asserts on-disk output + exit codes, gates on artifact presence with
  `describe.skipIf(!HAS_BIN)`, drops a **fake `claude` on PATH** that reproduces
  the exact #1558 narration bug (`FAKE_CHATTY_ONCE`) to prove the corrective
  retry, and carries a gated live variant behind `HARNESS_E2E_LIVE=1`.
- ~14 `*.e2e.test.ts` files and several `*.integration.test.ts` files exist,
  independently invented (`HARNESS_E2E`, `HARNESS_E2E_LIVE`, `HARNESS_E2E_GITHUB`
  each invent their own env gate).
- CI already runs the OS matrix `[ubuntu, windows, macos]` (`ci.yml`), and
  `main-health.yml` already runs on a daily `schedule:` cron.
- Canary is already integrated as the test-suite plugin.
- **The `.harness/e2e/run-e2e.sh` referenced in the ticket does NOT exist in the
  tree** — it is a gitignored local autopilot-dogfooding scratch dir of run logs,
  not a committed test framework. The "AMR e2e" work (#809) is a vitest in-process
  HTTP round-trip test (`amr-routing-endpoints-e2e.test.ts`), not a shell harness.
  There is nothing there to unify.

What is GENUINELY MISSING (this is the real scope):

1. A shared, reusable **temp-project / temp-git / win32-safe-spawn** test helper —
   the logic is copy-pasted inline across ~20 files today.
2. A **unified `skipIf` env gate** for the tiers (today each test invents its own).
3. An on-disk **captured-envelope fixture convention** — the #1558 shapes are
   inlined as JS strings; nothing is captured to `fixtures/`.
4. A **nightly Tier B lane** actually wired to run (the cron runs only an alarm).
5. A **"how to add an E2E test" doc** so Tier A/C become the default for new work
   (CONTRIBUTING's testing section is unit-only).

## Scope fork — resolved, not parked

The one genuine architecture fork the ticket names — **adopt Playwright vs extend
the existing vitest stack** — was already decided by the accepted **ADR 0111**:
tiered E2E on the existing vitest + canary stack; Playwright stays scoped strictly
to browser/dashboard flows. The motivating bug class is real _external-tool_
behavior (subprocess/git/MCP/network), which Playwright models no better than
vitest + real `spawn`. This proposal formalizes that decision rather than
re-opening it, so there is nothing to park.

## Tiers (per ADR 0111)

- **Tier A — deterministic real-boundary integration (per-PR, CI-safe).** Real
  subprocess/git/file/MCP IO against hermetic fixtures and real temp git repos;
  the boundary under test is NEVER mocked; no live network/LLM. Real tool
  behavior is replayed from captured artifacts (the #1558 envelopes).
- **Tier B — gated live smoke (nightly/dogfood).** Real `claude` CLI, real
  dispatch, real MCP round-trips. Opt-in via env/credential gates so it is a
  no-op on PRs and contributor machines; wired to the `main-health.yml` cron.
- **Tier C — CLI smoke (per-PR, CI-safe).** Invoke `harness <cmd>` as a real
  subprocess against a scaffolded temp project; assert on-disk output + exit codes.

## User stories

- As a maintainer adding a user-facing flow, I can add a Tier A/C E2E test in a
  few lines using a shared helper, so real-boundary coverage becomes the default.
- As a reviewer, I can trust that a merged PR's real CLI wiring, file IO, and
  git round-trip were exercised — not just mocked.
- As the project, real external-tool misbehavior (narration, omitted fields,
  nonzero exits) is caught by Tier A on every PR and by Tier B nightly.

## Success criteria (for this slice)

1. A shared E2E helper module (temp-project scaffold, temp-git init, win32-safe
   `runHarness` subprocess spawner, unified `skipIf` tier gates, fixture loader)
   exists and is consumed by at least one migrated flow.
2. A documented on-disk fixture convention under repo-root `fixtures/claude-cli/`,
   seeded with the #1558 good + chatty-narration envelopes.
3. At least one canonical Tier A + Tier C exemplar test runs green in CI on all
   three OSes via the existing per-package vitest run.
4. A nightly Tier B lane is wired (gated, no-op without creds, gate-reachability
   asserted) so a silently-skipped suite cannot masquerade as a pass.
5. A "how to add an E2E test" guide documents the tiers, helper API, fixture
   convention, and gates; CONTRIBUTING links it.

## Out of scope (named remaining work — why this is a first slice)

Delivering "every major user-facing flow has ≥1 E2E test" is an ongoing,
per-flow effort that cannot land in one PR. Deferred to follow-ups:

- Migrating the remaining ad-hoc `*.e2e.test.ts` files (orchestrator otel,
  core github-issues, the flagship comprehend suite in full) onto the shared
  helpers.
- New Tier A coverage for the other candidate first flows: orchestrator
  dispatch→gate→completion; MCP tool registration + representative round-trips.
- Promoting the helper from a package-local module to a shared cross-package home
  once a second package adopts it (ADR 0111 rejects a bespoke `@harness/e2e`
  package as premature; a shared location is a follow-up, not this slice).

Therefore this PR uses **`Refs #1691`**, not `Closes`, and names the remaining
work above.
