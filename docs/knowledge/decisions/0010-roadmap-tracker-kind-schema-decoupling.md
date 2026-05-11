---
number: 0010
title: tracker.kind schema decoupling — orchestrator workflow vs roadmap sync
date: 2026-05-09
status: accepted
tier: small
source: docs/changes/roadmap-tracker-only/proposal.md
---

## Context

Two `tracker.kind` enums exist in the harness configuration schema:

- **`workflow.tracker.kind`** (in `packages/orchestrator/src/config/workflow.ts`) — selects the runtime client used by the orchestrator to dispatch agent work. Accepts `"local"`, `"github"`, and (after Phase 4) `"github-issues"`. The third value selects `GitHubIssuesTrackerAdapter` (file-less mode) at orchestrator construction time; the prior two values select the orchestrator's legacy adapters.
- **`roadmap.tracker.kind`** (in `packages/cli/src/config/schema.ts`) — declares the project's canonical roadmap sync backend for file-backed mode. Currently a single value, `"github"`, selecting the `GitHubIssuesSyncAdapter` used by `syncToExternal` / `syncFromExternal` / `fullSync`.

These two enums evolved independently. The orchestrator one is newer (Phase 4 added `"github-issues"` for the file-less adapter dispatch). They share a field name (`kind`) and one value (`"github"`), but they live in different config sections and mean different things in each context. Several reviewers asked the obvious question: "should these be the same enum?"

## Decision

Keep the two enums as separate types with different value spaces.

- `roadmap.tracker.kind` stays `"github"` (single value, file-backed sync engine). It identifies the project's canonical sync target for `roadmap.md` bidirectional sync; this field is unused when `roadmap.mode === "file-less"` (the file-less adapter is selected via the `workflow.tracker.kind` path on the orchestrator side and via `createTrackerClient(config)` on the core side).
- `workflow.tracker.kind` is `"local"` | `"github"` | `"github-issues"`. The new `"github-issues"` value selects the file-less adapter at orchestrator construction time (Phase 4 commit `4039272d`, decision D-P4-E). The legacy `"github"` value is preserved for backward compatibility with the orchestrator's pre-file-less GitHub integration — Phase 4 deliberately avoided breaking the existing value.

The `"github"` string is shared by both schemas but is interpreted independently in each. In `roadmap.tracker.kind`, it identifies the file-backed sync target; in `workflow.tracker.kind`, it identifies the orchestrator's pre-file-less GitHub adapter. The config-validator helper `getRoadmapMode(config)` reads `roadmap.mode` only — nothing flows between the two enums.

## Consequences

**Positive:**

- Each schema can evolve without breaking the other. The orchestrator can add `"linear"` to `workflow.tracker.kind` without touching the file-backed roadmap sync engine, and the file-backed roadmap sync engine can add `"jira"` to `roadmap.tracker.kind` without touching the orchestrator dispatch.
- Backward compatibility: the legacy `workflow.tracker.kind: "github"` value continues to work for projects that were configured before file-less mode existed. Phase 4 did not break any existing config.
- The two value spaces being decoupled makes it trivial to grep for "all places that select the file-less adapter": only `workflow.tracker.kind: "github-issues"` and `roadmap.mode: "file-less"` participate.

**Negative:**

- Reviewers see two values named `kind` and reasonably assume they're the same field. This ADR (along with the `roadmap.mode` reference in `docs/reference/configuration.md`, Task 12 of Phase 6) is the mitigation.
- A future unification (single `tracker.kind` enum across both schemas) would be a breaking config change for every existing project; not urgent.

**Neutral:**

- The two `kind` enums could in principle accept the same set of values (`"github-issues"` could be added to `roadmap.tracker.kind` for symmetry). It is intentionally NOT added in this round because no consumer reads `roadmap.tracker.kind` when `roadmap.mode === "file-less"`; adding the value without a corresponding consumer would be misleading.

## Related

- ADR 0008 — IssueTrackerClient abstraction lives in `@harness-engineering/core`
- ADR 0009 — Audit history stored as GitHub issue comments
- Phase 4 plan: `docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-4-runtime-wiring-plan.md`
- Phase 4 commits: `2292b24c` (S2 stub removal), `4039272d` (createTracker dispatch on `workflow.tracker.kind`)
- Configuration reference: `docs/reference/configuration.md`
