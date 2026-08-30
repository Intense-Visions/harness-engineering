---
number: 0113
title: Lightweight nightly micro-loop primitive below the fleet family
date: 2026-08-30
status: accepted
tier: medium
source: 'roadmap item / issue #1405'
---

## Context

Dex Horthy / HumanLayer's highest daily-value practice is a "slow loop": one cron
job, one anti-pattern, one small human-reviewed PR every morning
(`docs/research/dex-horthy-humanlayer-comparison-analysis.md:31-34`, adoption
`[HORTHY-3]` at L132-140). Harness has no home for that shape. The `-fleet` family is
the right tool for a **batch of independent findings**, but even its lightest member,
`cleanup-fleet`, runs the full five-phase SELECT → CONFIRM → DISPATCH → VERIFY →
REPORT apparatus with worktree-isolated fan-out, a concurrency governor, and per-target
provenance/assumptions records (`agents/skills/claude-code/cleanup-fleet/SKILL.md:3,
37-51, 101-113`). That weight is correct for a batch and pure overkill for "fix one
thing, open one tiny PR, every night."

The closest existing piece is `harness-maintenance-pipeline`. But it is deliberately
**human-invoked and report-first**: it wraps `harness maintenance run --json`, presents
a triaged report, and only fixes on an explicit plain-text opt-in — and its own scope
note excludes exactly this use ("NOT for the autonomous cron fix-and-PR path — that is
the orchestrator scheduler's job",
`agents/skills/claude-code/harness-maintenance-pipeline/SKILL.md:11`).

Crucially, the mechanical substrate for a nightly loop **already exists** in the
orchestrator and is not the gap:

- `MaintenanceScheduler` evaluates cron schedules on an interval timer under leader
  election and invokes a callback per due task
  (`packages/orchestrator/src/maintenance/scheduler.ts:35-45`).
- `cron-matcher.ts` is a 5-field cron matcher already used by that scheduler
  (`packages/orchestrator/src/maintenance/cron-matcher.ts:1-18`).
- `mechanical-ai` registry tasks already encode "cron + one deterministic check +
  conditional fix + dedicated branch" — e.g. `arch-violations` (`schedule: '0 2 * * *'`,
  `checkCommand: ['check-arch', '--findings-json']`, `branch: 'harness-maint/arch-fixes'`,
  `fixSkill: 'harness-arch-fix'`) in
  `packages/orchestrator/src/maintenance/task-registry.ts:15-24`.
- `agent-dispatcher.ts` and `pr-manager.ts` already dispatch a bounded agent and
  open/refresh a PR for a task
  (`packages/orchestrator/src/maintenance/{agent-dispatcher,pr-manager}.ts`).

So the missing thing is **not** a scheduler or a PR opener. It is a thin, single-purpose,
**standing primitive** — one check, one small PR, one cron, owned by a team and adoptable
outside this repo — that sits _below_ `cleanup-fleet` in the hierarchy without inheriting
the fleet apparatus and without corrupting the report-first pipeline's contract. Today that
niche is homeless: a team wanting Horthy's loop must either stand up a fleet (too heavy) or
misuse the report-first pipeline (wrong contract).

## Decision

Introduce a **genuinely thin new standing primitive** — a nightly "micro-loop" —
distinct from both the fleet family and `harness-maintenance-pipeline`, defined by three
properties and nothing more:

1. **One cron trigger** — a single schedule the team owns, not the 22-task overdue/sweep
   registry.
2. **One deterministic check** — a single mechanical `checkCommand` emitting the
   `--findings-json` contract; if it is clean, the loop is a no-op that night.
3. **One small PR** — when the check finds something, dispatch a bounded fix and open a
   single tiny human-reviewed PR. No worktree isolation, no concurrency governor, no
   provenance/assumptions file, no CONFIRM round.

The primitive **reuses the existing maintenance mechanism** (`cron-matcher`,
`MaintenanceScheduler`'s per-task callback, `agent-dispatcher`, `pr-manager`) rather than
inventing a second scheduler or PR path — a `mechanical-ai` task is already 90% of the
shape. What is new is the **thin contract and its placement**: a standing, single-purpose
loop skill that sits underneath `cleanup-fleet` in the family hierarchy and is authored,
adopted, and reasoned about as "one anti-pattern, one PR, nightly" — deliberately _not_ a
fleet and deliberately _not_ the report-first pipeline.

We explicitly **do not** bolt a "cron / auto-fix mode" onto `harness-maintenance-pipeline`.
Its value is its report-first, human-invoked contract (surface findings, ask in plain text,
fix only on opt-in); adding a standing auto-PR mode would give it a split personality and
reintroduce exactly the surprise-PR hazard that skill was built to avoid. Report-first and
fire-and-open-a-PR are different contracts and belong in different primitives.

> **Assumptions made.** Absent a live human decision, this ADR takes the CONFIRM
> recommended default: (a) design a _new_ thin primitive rather than extending
> `maintenance-pipeline`; (b) it sits _underneath_ `cleanup-fleet`, not replacing it;
> (c) it _reuses_ the existing scheduler/dispatcher/pr-manager substrate rather than
> introducing a parallel one; and (d) the value proposition is the thinness plus the
> standing cadence, so worktree isolation and provenance ceremony are intentionally
> omitted, not forgotten. The exact surface (a new skill vs. a promoted "single-task"
> run mode over the registry) is left to the spec.

## Consequences

**Positive**

- Horthy's highest daily-value pattern finally has a home at the right weight — no
  five-phase apparatus, no worktree ceremony for a one-line fix.
- `maintenance-pipeline` keeps its clean report-first contract; `cleanup-fleet` keeps its
  batch/provenance contract. Each primitive stays single-purpose.
- Low build cost: the primitive composes proven parts (`cron-matcher`, scheduler
  callback, `agent-dispatcher`, `pr-manager`) instead of a new engine — reducing drift
  risk against the existing maintenance subsystem.

**Negative / risks**

- A standing auto-PR loop erodes the "no surprise PR" default the report-first pipeline
  protects. The mitigation is scope: exactly one check, exactly one small PR, and the PR
  is still human-reviewed and never auto-merged (the family's never-auto-merge invariant,
  `docs/reference/fleet-family.md`).
- Thinness means fewer guardrails than a fleet: no independent VERIFY re-scan, no all-OS
  CI gate before the PR opens. Acceptable because the loop opens a _reviewable_ PR (CI runs
  on it like any PR) rather than merging — but it must be documented that a micro-loop PR
  carries less pre-review verification than a fleet PR.
- Two adjacent "run one maintenance thing" surfaces (the report-first pipeline and the
  micro-loop) risk operator confusion; the boundary (human-invoked report vs. standing
  auto-PR) must be stated wherever both are discoverable.

**Neutral**

- The 22-task registry and orchestrator scheduler are unchanged; the micro-loop is an
  additional, narrower consumer of the same mechanism, not a rework of it.
- Beyond ~3 concurrent loops the research warns of compound-load failures
  (`dex-horthy...:34`); a single nightly micro-loop is well inside that ceiling, but the
  aggregate-load governance remains `fleet-command`'s concern, not this primitive's.

## Alternatives Considered

1. **Extend `harness-maintenance-pipeline` with a cron / auto-fix mode (rejected).**
   Reuses an existing skill, but it directly contradicts that skill's report-first,
   human-invoked contract — which its own SKILL.md declares out of scope for the cron
   auto-fix path (`harness-maintenance-pipeline/SKILL.md:11`). It would create a
   dual-personality skill and reopen the surprise-PR hazard the pipeline exists to close.

2. **Add a "fleet-of-one" / `--micro` mode to `cleanup-fleet` (rejected).** Keeps one
   entry point, but a fleet's value _is_ the batch apparatus: worktree isolation, the
   concurrency governor, per-target provenance, and the CONFIRM round
   (`cleanup-fleet/SKILL.md:37-51`). A single nightly fix would still drag all of that
   overhead and still hit the never-auto-merge batch-review model — the opposite of the
   ceremony-free daily cadence `[HORTHY-3]` calls for.

3. **"It already exists — just add more `mechanical-ai` registry tasks" (rejected as
   sufficient).** The mechanism exists, but a registry task is coupled to the shared
   overdue/sweep/leader-election subsystem and is not a standing, team-owned,
   individually-adoptable primitive. The decision _reuses_ that mechanism (see Decision)
   while giving the pattern its own thin contract and hierarchy placement — the part that
   is genuinely missing.

## References

- Issue #1405 — "Lightweight Nightly Micro-Loop Primitive."
- `docs/research/dex-horthy-humanlayer-comparison-analysis.md:31-34, 101-104, 132-140`
  — the "slow loop" practice and adoption decision `[HORTHY-3]`.
- `agents/skills/claude-code/harness-maintenance-pipeline/SKILL.md:3, 11` — report-first,
  human-invoked contract; cron auto-fix explicitly out of scope.
- `agents/skills/claude-code/cleanup-fleet/SKILL.md:3, 37-51, 101-113` — the lightest
  fleet's full apparatus (worktree isolation, governor, provenance).
- `packages/orchestrator/src/maintenance/scheduler.ts:35-45` — `MaintenanceScheduler`
  cron-driven per-task callback (reused mechanism).
- `packages/orchestrator/src/maintenance/cron-matcher.ts:1-18` — 5-field cron matcher.
- `packages/orchestrator/src/maintenance/task-registry.ts:15-24` — `mechanical-ai` task
  shape (cron + deterministic check + fix skill + branch).
- `packages/orchestrator/src/maintenance/{agent-dispatcher,pr-manager}.ts` — bounded
  agent dispatch and single-PR open/refresh (reused mechanism).
- `docs/reference/fleet-family.md` — the never-auto-merge invariant and aggregate-load
  governance the micro-loop inherits by placement below the family.
