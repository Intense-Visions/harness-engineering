# Plan: Dashboard Reorganization — Remove KPI Wall from Overview

**Date:** 2026-04-28 | **Spec:** docs/changes/dashboard-reorganization/proposal.md | **Tasks:** 1 | **Time:** ~3 min

## Goal

Complete Phase 4 of the Dashboard Reorganization spec by removing the Roadmap Progress KPI wall from Overview.tsx, leaving the overview as a pure triage feed (alerts + status strip).

## Observable Truths

1. When loading `/`, the system displays alert cards for actionable items but does NOT display Roadmap Progress KPI cards (Total/Done/Active/Planned/Blocked).
2. The compact status strip still shows roadmap progress percentage alongside other domain health summaries.
3. All other Overview functionality (SSE, project pulse, NeuralOrganism header, "All Systems Nominal" banner) is preserved.
4. No unused imports remain after the removal.

## File Map

```
MODIFY packages/dashboard/src/client/pages/Overview.tsx (remove Roadmap Progress section, lines 391-456)
```

## Tasks

### Task 1: Remove Roadmap Progress KPI section from Overview

**File:** `packages/dashboard/src/client/pages/Overview.tsx`

**Action:** Delete the entire Roadmap Progress section (the `{isRoadmapData(roadmap) && (...)}` block at lines 391-456).

**What stays:**

- Header with NeuralOrganism and "Command Center" branding
- Alerts section (health errors, blocked features, security threats, perf violations)
- "All Systems Nominal" banner when no alerts
- StatusStrip with condensed domain health

**What goes:**

- The "Roadmap Progress" section with 5 GlowCard number tiles (Total, Done, Active, Planned, Blocked)

**Verification:**

- `npx tsc --noEmit` — no type errors
- Visual: load `/` and confirm no KPI cards render
- Confirm imports still used: `GlowCard` (AlertCard), `Compass` (StatusStrip), `isRoadmapData` (buildAlerts, StatusStrip)

**Commit:** `fix(dashboard): remove roadmap KPI wall from overview to complete triage feed transition`

## Traceability

| Observable Truth                   | Task                                             |
| ---------------------------------- | ------------------------------------------------ |
| OT1: No KPI cards on `/`           | Task 1                                           |
| OT2: Status strip preserved        | Task 1 (not modified)                            |
| OT3: Other functionality preserved | Task 1 (only KPI section removed)                |
| OT4: No unused imports             | Task 1 (verified — all imports still referenced) |

## Spec Success Criteria Coverage

| Criterion                                  | Status After This Plan      |
| ------------------------------------------ | --------------------------- |
| SC5: `/` renders triage feed, not KPI wall | **Met** — KPI wall removed  |
| SC1-SC4, SC6-SC10                          | Already met by prior phases |
