---
number: 0099
title: Version-skew guard coverage across the MCP surface
date: 2026-08-18
status: proposed
tier: medium
source: 'design routing of bug-backlog issue #1301'
---

## Context

PR #1293 added a version-skew guard (`packages/cli/src/utils/version-guard.ts`)
that refuses findings-producing commands when the running CLI is sharply out of
step with the workspace's declared `toolchain.cliVersion`. The set of guarded
commands (`GUARDED_COMMANDS`: `check-arch`, `check-security`, `check-deps`,
`check-docs`, `cleanup`, `cross-check`, `check-perf`, `validate`, `review-ci`,
`check-deployment`, `check-harness-strength`) is exactly the surface that emits
the `--findings-json` contract an orchestrator parses and schedules on.

The problem is _where_ the guard sits. `installVersionGuard(program, cwd)` wires
it as a single Commander root-level `preAction` hook in
`packages/cli/src/index.ts`. That hook fires **only** on CLI process
invocations. The MCP tool handlers under `packages/cli/src/mcp/tools/` reach the
same detection logic by a different door: they `await import`
`@harness-engineering/core` and call the check implementations in-process
(e.g. `ci.ts` calling `runCIChecks`). No MCP handler references the guard —
grepping `packages/cli/src/mcp/` for `version-guard`/`evaluateVersionGuard`
returns nothing. Every MCP findings-producing path bypasses the guard entirely.

This is the likelier stale path, not the edge case. The incident that motivated
#1293 was a stale `harness` shim resolving to an old install; the _same_
directory carries a stale `harness-mcp` shim from that same install. An
agent-driven conductor prefers `run_skill` / MCP tools over shelling out to the
CLI, so the MCP route is arguably the _more_ likely way to reach a stale scanner
in exactly the scenario the guard was written for. A stale MCP server produces
the identical failure signature: well-formed, confident, wrong findings, because
it predates the suppression passes the workspace now expects.

Note the guard is deliberately forward-looking — it cannot fire inside a CLI old
enough to predate it — so this is about coverage of the surface, not
retroactivity.

## Decision

Relocate the version-skew check from the CLI transport boundary **into the
shared core check implementations** — the one chokepoint that both the Commander
`preAction` hook and every MCP handler necessarily traverse. Concretely:
`evaluateVersionGuard` (and the refusal it produces) moves down into
`@harness-engineering/core` at the entry of the findings-producing check
functions (e.g. `runCIChecks` and its siblings), keyed off the same
`toolchain.cliVersion` resolution and `GUARDED_COMMANDS`-equivalent surface.

The CLI `preAction` hook becomes a thin caller that formats and exits on the
core-produced refusal (preserving today's exact CLI UX, message, and escape
hatch); MCP handlers inherit the guard for free because they call the same core
functions. The check is thereby transport-agnostic: CLI and MCP are both
honored by construction, and any _future_ transport (HTTP gateway, embedded
runner) is covered without a third wiring site.

## Consequences

**Positive:**

- One chokepoint covers every transport. A stale `harness-mcp` server now
  refuses to emit findings exactly as a stale `harness` CLI does.
- No duplicated guard logic to drift between transports; the refusal message,
  major-delta threshold, and escape hatch have a single source of truth.
- New findings-producing surfaces are guarded by default rather than opt-in.

**Negative:**

- Core gains awareness of the running CLI version (must be threaded in as a
  parameter, not read from CLI globals) to keep core transport-neutral.
- The MCP path now has a new refusal outcome; MCP handlers and their contract
  tests must surface the refusal as a structured tool error, not a thrown crash.

**Neutral:**

- The CLI hook stays, reduced to formatting/exit; existing CLI guard tests
  continue to pass against the same observable behavior.

## Alternatives Considered

- **(b) Wire the guard into each findings-producing MCP handler (~8 sites).**
  Rejected. It re-duplicates the exact class of coverage gap this ADR closes:
  eight opt-in call sites drift, and the ninth handler added next quarter is
  silently unguarded again. A guard you must remember to install is a guard that
  will be forgotten.
- **(c) Guard at the MCP server bootstrap.** Rejected. It is the mirror image of
  today's bug — a guard at a _second_ transport boundary that will in turn miss
  a _third_ transport, and it cannot see per-command context (which tool, which
  findings contract) that lives below the boundary. A guard at the transport
  edge always misses the next transport; placing it at the shared check
  implementation is the only site that is transport-count-invariant.

## References

- #1301 — MCP tools bypass the version-skew guard (this decision).
- PR #1293 — original version-skew guard, wired as a Commander `preAction` hook.
- #1259 §5 — stale-shim / stale-scanner failure-signature analysis.
