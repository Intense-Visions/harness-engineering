---
title: Assignee means "who is executing" — set at execution, not selection
status: draft
keywords:
  - roadmap
  - assignee
  - orchestrator
  - roadmap-pilot
  - tracker-sync
  - github-issues
  - claim-lifecycle
  - agent-autonomy
---

# Assignee means "who is executing" — set at execution, not selection

## Overview & Goals

**Problem.** The roadmap `assignee` field is written at _selection_ time
(roadmap-pilot's Phase 4 ASSIGN step, `agents/skills/claude-code/harness-roadmap-pilot/SKILL.md:136-147`,
which calls `manage_roadmap update` with `assignee: <currentUser>`). But the
orchestrator's pickup gate (`packages/orchestrator/src/core/candidate-selection.ts:74-79`)
reads any non-self assignee as a human claim and refuses to dispatch. So running
roadmap-pilot silently makes an item invisible to autonomous pickup.

A second, compounding defect lives in the roadmap↔GitHub sync:

- **Outbound laundering:** a machine claim (`assignee = orchestrator-5c895000`) is
  not a valid GitHub login, so the sync adapter falls back to the authenticated
  user and assigns the issue to the _human_
  (`packages/core/src/roadmap/adapters/github-issues.ts:218-226`, `getAuthenticatedUser`).
- **Inbound clobber:** "external wins" (`packages/core/src/roadmap/sync-engine.ts:128-136`)
  can then overwrite the roadmap's `orchestrator-*` claim with that human handle,
  making the orchestrator drop its own claim on the next tick.

**Goal.** Establish one invariant — **`assignee ≠ null ⟺ status == in-progress`** —
owned by a single core authority, so the assignee always names the _current
executor_ (human or machine) and never a future-intended owner. Reconcile the two
GitHub adapters so a machine claim is represented as a comment + in-progress label,
never the GitHub assignee field. This directly advances the **Agent Autonomy**
metric (`STRATEGY.md#key-metrics` — "% of merged PRs whose commits are 100%
bot/automation") by removing a class of false "human-owned" blocks on the
orchestrator, and embodies the constraints-as-code thesis (`STRATEGY.md#our-approach`).

**Non-goals (YAGNI).**

- No change to roadmap-pilot _scoring/recommendation_ — only the assignee write is removed.
- No change to the orchestrator pickup gate — it is correct; the bug is upstream.
- No GitHub bot-account provisioning — machine claims stay as comment + label.
- No new assignee semantics for `blocked`/`needs-human`/`done` beyond "must be null".

**In scope:** roadmap-pilot (recommend-only), harness-execution (claim at start), a
core `assignee-lifecycle` authority, both GitHub adapters' machine-claim handling,
inbound-sync claim protection, and RMH005 + `groom` migration.

## Assumptions

- **Runtime:** Node.js ≥ 18.x (the harness monorepo target).
- **Tracking model:** the design targets roadmap-backed tracking (`tracker.kind: "roadmap"`,
  the default) where the assignee lives in `docs/roadmap.md` and is synced to GitHub.
  The file-less github-issues issue-tracker path already claims via comment and is
  unaffected except for the shared `isMachineAssignee` predicate.
- **Identity:** `currentUser` is resolvable at execution start (same resolution
  roadmap-pilot uses today). When it is not, harness-execution stops with a clear
  message rather than claiming with a null owner (resolved — Success Criterion #11).

## Decisions made

| #   | Decision                                                                                                                                                                                                                                                                                                                                   | Rationale                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Assignee is set at execution start, not selection.** roadmap-pilot stops writing the assignee; harness-execution claims as its first step (`status=in-progress` + `assignee=<currentUser>`). The orchestrator already claims at dispatch.                                                                                                | Selection ≠ ownership. Pilot's pre-assignment is exactly what blocked autonomous pickup. Execution start is the one true "who is working on this now" moment.                                     |
| D2  | **Machine claims never touch the GitHub assignee field.** Outbound drops the `getAuthenticatedUser` launder (machine id → no GitHub assignee); the claim shows as the existing `claimed` comment + in-progress label. Inbound never lets an external assignee overwrite a live `orchestrator-*` claim. Human assignees push/pull normally. | A machine id isn't a GitHub user; laundering it to the human is the root of the original confusion and of the inbound clobber. Comment-based claim is what the orchestrator-tracker already does. |
| D3  | **Invariant `assignee ≠ null ⟺ in-progress`, mechanically enforced.** New health rule RMH005 fails `harness validate` on any non-in-progress row carrying an assignee; `groom` auto-clears them; a one-time migration cleans existing drift.                                                                                               | Constraints-as-code (`STRATEGY.md#our-approach`): prevents the whole bug class going forward rather than relying on behavior alone. Mirrors existing RMH001-004 + groom.                          |
| D4  | **Centralized authority (chosen over per-layer guards).** One core module owns the invariant, the `isMachineAssignee` predicate, and `claim()/release()` transitions; pilot/execution/sync/orchestrator/health all call it.                                                                                                                | The bug was born from two GitHub adapters disagreeing. A single source of truth is the on-thesis fix and prevents re-divergence.                                                                  |

## Technical Design

### New core module: `packages/core/src/roadmap/assignee-lifecycle.ts`

```ts
/** True for orchestrator/machine ids that are NOT real GitHub logins. */
export function isMachineAssignee(assignee: string | null): boolean;
//   /^orchestrator-[0-9a-f]{8}$/  ||  legacy /^[\w-]+-[0-9a-f]{8}$/
//   (consolidates the regex currently inline at adapters/github-issues.ts:220)

/** The invariant: assignee is non-null IFF the row is in-progress. */
export function assigneeInvariantHolds(feature: RoadmapFeature): boolean;
//   (feature.assignee != null) === (feature.status === 'in-progress')

/** Execution-start transition: set in-progress + assignee, log history. */
export function claim(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  assignee: string,
  date: string
): void;
//   asserts assignee != null; sets status='in-progress'; delegates to
//   assignFeature() for the assignee write + history entry.
//   COMPARE-AND-SET (S4-003): refuse if the row is already in-progress with a
//   different assignee — first claim wins (covers human↔orchestrator races).

/** Execution-end / handoff transition: clear assignee, log history. */
export function release(roadmap: Roadmap, feature: RoadmapFeature, date: string): void;

/** Status-change chokepoint: any transition AWAY from in-progress auto-clears
 *  the assignee via release() (S4-001), so the invariant cannot be transiently
 *  violated. The manage_roadmap update path and orchestrator/execution
 *  completion routes all flow through this. */
export function setStatus(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  status: FeatureStatus,
  date: string
): void;

/** Outbound-sync policy: should this assignee be pushed to the external tracker? */
export function pushAssigneeToExternal(assignee: string | null): boolean;
//   false for machine ids (and null is a no-op); true for human handles.
```

Exported from `packages/core/src/roadmap/index.ts`.

### Wiring (all route through the authority)

- **roadmap-pilot** (`harness-roadmap-pilot/SKILL.md`): delete the Phase 4 ASSIGN
  `manage_roadmap update … assignee` write (lines ~136-147). Pilot now
  selects + recommends + transitions only. Update the skill's one-line description
  ("…assigns it…") accordingly.
- **harness-execution** (`harness-execution/SKILL.md`): add a first execution step —
  when `docs/roadmap.md` exists, `manage_roadmap update` with
  `status: in-progress, assignee: <currentUser>`. **If `currentUser` cannot be
  resolved, STOP with a clear message** ("Set your identity via git config / harness
  config before starting execution") rather than claiming with a null owner (S4-002).
  `currentUser` resolved the same way
  roadmap-pilot resolves it today.
- **`manage_roadmap` update** (`packages/cli/src/mcp/tools/roadmap.ts:329-330`): when
  `status==in-progress` and an assignee is supplied, route through `claim()`; any status
  change away from in-progress routes through `setStatus()` (auto-clears assignee);
  reject a bare assignee write on a non-in-progress status (invariant guard at the write path).
- **orchestrator roadmap tracker adapter** (`packages/orchestrator/src/tracker/adapters/roadmap.ts:148`):
  route its `assignee=orchestratorId` write through `claim()`.
- **outbound sync** (`syncToExternal` → `GitHubIssuesSyncAdapter.updateTicket`,
  `adapters/github-issues.ts:268-271` + `resolveAssigneeLogin:217-226`): use
  `pushAssigneeToExternal()`; for a machine id, push **no** assignees (leave the issue
  as-is). Remove the `getAuthenticatedUser` fallback.
- **inbound sync** (`applyTicketToFeature`, `sync-engine.ts:128-136`): "external wins"
  only when the local assignee is null or a human; if `isMachineAssignee(feature.assignee)`,
  keep the local claim (do not overwrite, do not record an assignmentChange).
- **pickup gate** (`candidate-selection.ts:74-79`): **unchanged** — correct as-is.

### Enforcement & migration

- **RMH005** in `packages/core/src/roadmap/health.ts`: finding for any feature where
  `assignee != null && status !== 'in-progress'`. Error severity (fails `harness validate`,
  like RMH003).
- **`groom`** (`groomRoadmap`): clear assignee on non-in-progress rows, appending an
  `unassigned` assignment-history entry.
- **One-time migration:** run `groom` (or an equivalent script) as part of this change so
  existing `planned + assignee` rows are cleaned before RMH005 turns red.

## Integration Points

**Entry Points.** New core module `roadmap/assignee-lifecycle.ts`; modified
`manage_roadmap` update path; new health rule RMH005; extended `groom` action; two
modified skill markdowns (roadmap-pilot, harness-execution); modified sync engine +
both GitHub adapters; modified orchestrator roadmap tracker adapter.

**Registrations Required.** Export `assignee-lifecycle` symbols from
`packages/core/src/roadmap/index.ts`; register RMH005 in the health-rule set; SKILL.md
edits trigger plugin-artifact / slash-command regeneration in pre-commit — regenerate and
include those artifacts in the commit.

**Documentation Updates.** `docs/knowledge/roadmap/roadmap-promotion.md` and
`roadmap-maintenance.md` (assignee lifecycle + RMH005); AGENTS.md roadmap section if it
documents assignee semantics; the roadmap-pilot and harness-execution skill docs.

**Architectural Decisions.** D1+D3 (assignee = execution-claim invariant) and D2
(machine claims never use the GitHub assignee field) together warrant **one ADR** —
"Assignee is an execution claim" — because they redefine a field's meaning across the
roadmap, sync, and orchestrator subsystems and will be referenced by future tracker work.

**Knowledge Impact.** Add knowledge nodes for: the invariant
(`assignee ≠ null ⟺ in-progress`), the `isMachineAssignee` predicate, and the
`claim/release` lifecycle as the single transition path.

## Success Criteria

1. After roadmap-pilot recommends an item, its roadmap row stays `planned` with
   `Assignee: —` (no assignee written).
2. After harness-execution begins on an item, the row is `in-progress` with
   `Assignee: <currentUser>`.
3. The orchestrator dispatches a `planned`, unassigned, spec'd item (no longer skipped).
4. Outbound sync of a row with `assignee=orchestrator-*` leaves the GitHub issue's
   `assignees` empty; the claim is visible as the `claimed` comment + in-progress label.
5. Inbound sync does **not** overwrite a local `orchestrator-*` assignee with an
   external/human handle.
6. `harness validate` fails (RMH005) on a `planned`+assignee row; `groom` clears it;
   validate then passes.
7. A human assignee set on GitHub still syncs onto the roadmap for an in-progress item
   (external-wins preserved when local is null/human).
8. **Regression (the reported bug):** run roadmap-pilot on an item, then run the
   orchestrator — it picks the item up with no manual unassign.
9. Setting a row's status to anything other than `in-progress` (via `setStatus`/
   `manage_roadmap update`) clears its assignee in the same operation; RMH005 stays green
   with no groom pass needed (S4-001).
10. `claim()` refuses a second claim on a row already `in-progress` under a different
    owner — first claim wins (S4-003).
11. harness-execution refuses to start with an actionable message when `currentUser`
    cannot be resolved, leaving the row `planned` and unassigned (S4-002).

## Implementation Order

**Phase 1 — core authority + behavior (unblocks autonomy).**
`assignee-lifecycle.ts` (`isMachineAssignee`, `assigneeInvariantHolds`, `claim` with
compare-and-set, `release`, `setStatus` auto-clear, `pushAssigneeToExternal`); route
`manage_roadmap` update + orchestrator roadmap adapter through `claim()`/`setStatus()`;
drop pilot's assignee write; add harness-execution's claim step (with the unresolved-identity
stop); outbound (no machine launder) + inbound (protect machine claim) sync changes;
unit + integration tests including the Success-Criteria #8 regression and #9–#11.

**Phase 2 — enforcement + migration.** RMH005 health rule; `groom` auto-clear; one-time
migration of existing rows; docs + ADR + knowledge-graph nodes; `harness validate` green.
