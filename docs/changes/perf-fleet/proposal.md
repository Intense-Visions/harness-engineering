# perf-fleet — fan out performance-budget/regression remediation across the codebase

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator) · **Issue:** #1233
**Family:** `-fleet` (a quality-queue member working alongside the core conveyor)
**Keywords:** fleet, orchestration, batch, performance, perf-budget, regression, benchmark, measured-before-after, critical-path, fan-out, worktree, batch-review

## Overview

The harness already _enforces_ performance on a single change: `harness-perf` gates one PR's diff against complexity, coupling, size, and benchmark-regression budgets. What it does not do is _work down a backlog_. A codebase that has drifted over dozens of merges accumulates many independent budget breaches and runtime regressions on hot paths, and remediating them by hand is a per-target attention slog — find the violation, measure its before-state, scope the fix, prove the improvement, open a reviewable PR — one at a time, with a human present throughout. For a codebase with dozens of hot paths the human's attention, not the machinery, is the bottleneck.

`perf-fleet` fills that gap as the perf analog of the existing quality-queue members. It enumerates the perf-budget/regression backlog by composing the existing perf detectors, confirms the batch with the human once, fans out worktree-isolated subagents that each run the **real** per-target measure → remediate → re-measure pipeline, independently verifies every result against a re-measurement, and returns a **tiered batch**: merge-ready perf-fix PRs for the bounded optimizations, and filed issues (carrying the measurement evidence) for the redesigns too large to auto-fix. It is a **quality-queue** member — off the core intake → decide → build → land spine, working the performance queue alongside `cleanup-fleet` (entropy), `docs-fleet` (doc drift), `bug-fleet` (latent defects), and `cicd-fleet` (CI-red).

The defining property is its verification bar. A performance "fix" that is not measured is a guess, and the cheapest way to make a red gate green is to move the goalpost — relax a budget or rebaseline the regression away. `perf-fleet` therefore holds a **measured before/after bar**, the direct perf analog of `bug-fleet`'s reproduction bar: a target is not remediated until a re-measurement against **unmodified** baselines proves the budget is now met. **No measured before/after, no fix** — and a "remediation" that only edited the baseline or the threshold fails that bar by design.

### Goals

- Turn a risk-ranked sweep of the performance backlog into a tiered batch — verified perf-fix PRs plus filed redesign issues — with a single up-front human touchpoint plus one batch review.
- Hold an uncompromising measured-before/after bar so the fleet's output is proven improvement, not a rebaselined illusion.
- Dogfood the real per-target pipeline (`harness-perf` for measurement, `harness-debugging` / `harness-refactoring` for the fix) — never hand-optimize or short-cut it, and prove it ran by the measured before/after it leaves behind.
- Compose the existing perf detectors and measurement (`check_performance`, `harness check-perf`, `get_perf_baselines`, `get_critical_paths`, `update_perf_baselines`, `harness-perf`) — reimplement no perf measurement.
- Never auto-merge; the human lands the batch (optionally via `pr-fleet`).

### Non-goals (YAGNI)

- Auto-merging perf-fix PRs.
- Applying a risky/architectural redesign autonomously — those are filed with their measurement evidence attached.
- Enforcing the perf gate on a single PR's diff — that is `harness-perf` inline; perf-fleet fans out across many standing targets.
- Reimplementing the benchmark harness, complexity metrics, or baseline management — the queue and the measurement are built by composing `harness-perf`.
- Remediating maintainability entropy with no measurement — that is `cleanup-fleet`.
- New executable orchestrator code — the deliverable is the authored skill contract (SKILL.md + skill.yaml), consistent with every existing member; the spine's `Workflow` primitive is the named future deterministic upgrade.

## Design

perf-fleet builds on the shared `-fleet` spine (`docs/reference/fleet-family.md`) and defines only what is its own. It runs the five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT skeleton, inherits the concurrency governor, the per-leaf context-replay budget, the base-freshness clause, the worktree fan-out, the canonical `FleetHandoffRecord`, and the never-silent-merge invariant.

### Queue (SELECT)

Compose the existing perf detectors into remediation targets: `check_performance` (posture vs budgets), `harness check-perf --structural`/`--coupling` (Tier 1/2/3 complexity/coupling/size breaches) with `get_critical_paths` (the stricter-threshold hot-path set), and the benchmark regression detector (`harness perf bench` vs `get_perf_baselines`, noise margin applied). Every target enters the queue with a **measured before-state recorded** — the metric vs its threshold/baseline, the tier, and the delta%. A finding with no measurement is not a perf target (it is `cleanup-fleet`'s). Score by composite **tier severity × critical-path weight × churn** via `roadmap-pilot`-style impact scoring.

### Per-target pipeline (DISPATCH)

A **fixed** measure → remediate → re-measure loop, not an ADR 0103 router — mirroring `bug-fleet`, which also uses a fixed pipeline. The fix-driver within the loop is selected by the violation's cause: `harness-debugging` diagnoses and fixes a runtime regression (the same diagnosis-and-fix pipeline `bug-fleet` uses); `harness-refactoring` brings a structural complexity/coupling breach under threshold. `harness-perf` establishes the before on unmodified code and re-measures the after; `update_perf_baselines` persists the improvement — only ever a faster number.

### Triage taxonomy — the tiered decision

The one genuine member-scoped fork (the candidate the lane brief named: _auto-remediate vs only file_) is resolved **tiered**, by precedent, with a defensible default rather than parked:

- **safe** (auto-remediated → merge-ready fix PR): a bounded local optimization that provably meets the budget without changing public API or observable behaviour — an algorithmic fix, an N+1 removal, memoization, an extract-method that lowers cyclomatic complexity under threshold.
- **risky** (filed as an issue with evidence): a large/architectural redesign, a correctness-sensitive hot-path change, or any public-API/behaviour change. Filed with its measured before-state and a recommendation, never auto-applied.

This is exactly `bug-fleet`'s tiered output (fix PRs for the bounded, filed issues for the risky) and `craft-fleet`'s (elevation PRs + filed roadmap items). It is defensible because auto-applying an architectural rewrite on a hot path is precisely where a subtly-wrong optimization hides — the one place the fleet must defer to a human. The classification is surfaced as an **overridable CONFIRM decision**, so the human may re-route any target before fan-out.

### Terminal act (REPORT)

A one-row-per-target tiered summary — verified fix PRs with before → after numbers and assumptions notes, plus filed redesign issues carrying the evidence. Never merges.

## Alternatives considered

- **File-only (detect-and-file, never remediate).** Rejected: it under-delivers versus the family, which auto-remediates the bounded class everywhere (`cleanup-fleet`, `docs-fleet`, `bug-fleet`). A perf-fleet that only files issues is a scanner, not a fleet.
- **Auto-remediate everything (no file tier).** Rejected: a hot-path architectural rewrite auto-applied and auto-verified only against a benchmark is exactly the change a human must review before it is even authored; the risk of a subtly-wrong correctness change on a hot path is too high. The tiered split is the safe middle.
- **ADR 0103 item-type routing (bug/spec-ready/feature).** Rejected as N/A: perf has one per-target pipeline (measure → remediate → re-measure); the only variation is the fix-driver (debugging vs refactoring), selected by the violation's cause, not a design-vs-diagnose route. `bug-fleet` set this precedent.
- **Fold perf into `cleanup-fleet`.** Rejected: the line is the measurement bar. `cleanup-fleet` remediates structural entropy for maintainability with no benchmark; perf-fleet gates every fix on a measured before/after. Disjoint queues, disjoint verification bars.

## ADR

**Not warranted.** perf-fleet introduces no new family-level decision — it references the existing family ADRs (0087 fan-out, 0088 front-load/park, 0105 claim-lease). The tiered remediate-vs-file decision is member-scoped and resolved here by precedent, not a family ADR — the same posture `docs-fleet`, `cleanup-fleet`, and `bug-fleet` took.

## Acceptance criteria

1. `harness skill validate perf-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist, domain-specific Rationalizations parity passes).
2. `agents/skills/claude-code/perf-fleet/{SKILL.md,skill.yaml}` exist; the SKILL.md contains the five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, REPORT), an Iron Law, a Boundary section, Gates, Escalation, domain-specific Rationalizations to Reject, Red Flags, Examples, and Test Scenarios.
3. The measured before/after bar is stated as an Iron Law, and "never move the goalpost" (rebaseline / threshold relaxation) is a named Gate and a Test Scenario.
4. The terminal act is tiered (fix PRs + filed issues), and the risky class is filed-not-applied.
5. `agents/skills/{codex,cursor,gemini-cli}/perf-fleet` resolve as symlinks to `../claude-code/perf-fleet`.
6. The SKILL.md/skill.yaml bodies carry zero internal roadmap/PR/issue numbers (they ship to adopter projects); the spine and ADRs are cited by name/title only.
7. `docs/reference/skills-catalog.md` + `docs/reference/tool-catalog.md` are regenerated and list `perf-fleet`; slash commands are generated for all platforms.
8. `harness skill validate` (whole-suite) still exits 0 (no regression).
9. `prettier --check`, `generate:plugin:check`, and `generate-docs`/tool-catalog freshness pass for the created/edited files.
10. A no-release changeset is present (no publishable `packages/<pkg>/src` touched).
