# Proposal: Scope `harness validate` to the changed surface

**Issue:** [#1523](https://github.com/Intense-Visions/harness-engineering/issues/1523)
**Milestone:** v5.0 — Telemetry & Effectiveness · **Priority:** P1
**Stage:** brainstorming → planning → execution → review

## Problem

Adoption telemetry from a dogfood consumer (`.harness/metrics/adoption.jsonl`)
shows `cli/validate` accounts for **2,097 invocations — 68% of every harness CLI
call**. `harness validate` runs a set of project checks; most are fixed-scope and
cheap (AGENTS.md, roadmap health, ADR numbers, STRATEGY.md, pulse), but the design
audits — **detect-drift** and **audit-brand** — walk the _entire_ source tree on
every run. Re-walking the whole tree for a one-file change, on the most-invoked
command, is the single highest-leverage latency/cost fix available.

## Call-site audit (part of scope, per operator request)

Every place this repo invokes validation was audited:

| Call site                                              | What it runs                                | Walks design surface?                                                                                                          | Disposition                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit`                                    | `harness ci check`                          | **No** — core `runValidateCheck` validates AGENTS.md only; the design walkers live in the CLI `runValidate`, not in `ci check` | Left full (already cheap; not the hot design-walker path)                                                                                                                                 |
| `.husky/pre-push`                                      | —                                           | n/a (no validate)                                                                                                              | n/a                                                                                                                                                                                       |
| `.github/workflows/persona-*.yml` (×3)                 | `harness validate` (advisory, non-blocking) | Yes                                                                                                                            | Left full — **generated** files (from `agents/personas/*.yaml`); advisory + once-per-PR low frequency; rewiring needs the persona-workflow generator + drift guard for negligible benefit |
| `packages/orchestrator/package.json` `validate` script | `harness validate`                          | Yes                                                                                                                            | **Rewired to `--changed`** — the one direct per-change dev-loop `harness validate` call site                                                                                              |
| MCP `validate_project` / `validate_cross_check`        | in-process                                  | validate_project walks design surface                                                                                          | No committed hot-loop caller in this repo; unchanged (opt-in remains available)                                                                                                           |

**Finding:** the 2,097 telemetry invocations are overwhelmingly _interactive_
agent/human `harness validate` calls, which no committed automation controls — those
adopt `--changed` at the point of use (the new opt-in flag + docs). The one committed
per-change dev-loop call site (the orchestrator `validate` script) is rewired.

## Approach

1. **Opt-in `--changed` / `--affected` flag** (plus `--since <ref>` and
   `--default-branch <name>`). Bare `harness validate` keeps the full sweep —
   non-breaking.
2. **Derive the changed surface from git**: merge-base with the default branch (or
   `--since` ref), union of tracked diffs + untracked files, existing files only.
3. **Narrow to the design surface**: keep only files a full sweep would scan
   (source extensions, skip-dirs, `analysis.exclude` ∪ `design.exclude`), so a
   scoped run is a strict subset of a full run (`scoped ⊆ full`).
4. **Hand the narrowed list to the walkers** via their existing `files` scoping
   arg (detect-drift, audit-brand). Component-anatomy is _not_ scoped — it is
   called with no file list in both modes today (a no-op in validate), so scoping
   it would activate it in affected mode only and break parity.
5. **Fail safe**: if the surface cannot be derived, fall back to a full sweep and
   report why — never validate an empty surface (a false green).
6. **Auditable**: every run records a `scope` block (mode, ref, changed count,
   scoped checks) and prints it, including the staleness caveat.
7. **Telemetry**: record scoped-vs-full via a `variant` field on the `cli/validate`
   adoption record, keeping the primary `cli/validate` key stable.
8. **Docs**: state the staleness contract — full sweep still required for
   pre-merge, scheduled, and release runs.

## Acceptance criteria (from the issue)

- [x] On a repo where a subset of files changed, the design walkers scan only the
      changed surface (verified: 125 changed design files → 28 findings vs 328 for the
      full sweep).
- [x] Affected-only and full-sweep agree — no finding present in full and absent in
      scoped for the changed surface (verified: 0 affected findings absent from full;
      `scoped ⊆ full`).
- [x] Adoption telemetry records scoped vs. full invocations (`variant` field).
- [x] Docs state the staleness contract (`docs/guides/ci-cd-validation.md`).

## Non-goals

- Changing bare `harness validate` default behavior (stays full sweep).
- Turbo/task-cache integration — `harness validate` is an in-process check runner,
  not a turbo task graph; the leverage here is scoping the file walkers, not riding
  a task cache.
- Scoping the fixed-scope checks (roadmap, ADR, AGENTS.md) — they are cheap and
  correctness depends on their whole-project view.
