---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': patch
---

feat(roadmap): assignee means "who is executing" — set at execution, not selection

Establish the invariant **`assignee ≠ null ⟺ status == in-progress`**, owned by a
single core authority (`packages/core/src/roadmap/assignee-lifecycle.ts`), so the
roadmap assignee always names the _current executor_ (human or machine) and never a
future-intended owner.

- **New core authority** exports `isMachineAssignee`, `assigneeInvariantHolds`,
  `isClaimableBy`, `claim` (compare-and-set, first-claim-wins), `release`, and
  `setStatus` (auto-clears the assignee on any transition away from in-progress).
- **roadmap-pilot** no longer writes the assignee at selection; **harness-execution**
  claims at execution start (stopping cleanly when identity is unresolvable). This fixes
  the orchestrator silently skipping pilot-touched items.
- **Machine claims never use the GitHub assignee field**: outbound sync drops the
  authenticated-user launder, inbound sync never clobbers a live `orchestrator-*` claim.
  The dead `getAuthenticatedUser` path is removed.
- **Enforcement:** new health rule **RMH005** fails `harness validate` on any
  non-in-progress row carrying an assignee; `groom` auto-clears such rows.
- The orchestrator completion path and inbound status sync now route status changes
  through `setStatus()`, so a completed/synced row releases its machine claim instead of
  leaving an invariant-violating `done`+`orchestrator-*` row. `manage_roadmap update`
  surfaces a refused claim explicitly (`claimed: false`, `isError`) under first-claim-wins.

See ADR-0045 (`docs/knowledge/decisions/0045-assignee-is-an-execution-claim.md`).
