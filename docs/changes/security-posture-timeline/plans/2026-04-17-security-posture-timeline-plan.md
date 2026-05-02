# Plan: Security Posture Timeline

**Date:** 2026-04-17 | **Spec:** docs/changes/security-posture-timeline/proposal.md | **Tasks:** 6 | **Time:** ~25 min

## Goal

The security module provides historical tracking of security scan results with supply chain monitoring, time-to-fix analysis, and trend attribution via a `SecurityTimelineManager` class.

## Observable Truths (Acceptance Criteria)

1. When `SecurityTimelineManager.capture(scanResult, commitHash)` is called, a snapshot is appended to `.harness/security/timeline.json` with per-category and per-severity finding counts.
2. When `captureSupplyChain()` is called, npm audit advisory counts by severity are returned as a `SupplyChainSnapshot`.
3. When findings appear in one snapshot and disappear in a later snapshot, `computeTimeToFix()` returns mean/median resolution times in days.
4. When `trends()` is called with 2+ snapshots, it returns directional trends with attribution describing which categories changed.
5. When `computeSecurityScore()` is called, it returns a 0–100 score using the weighted severity formula.
6. The system shall export all new types and the manager class from `packages/core/src/security/index.ts`.
7. `npx vitest run packages/core/tests/security/security-timeline-manager.test.ts` passes.

## File Map

```
CREATE packages/core/src/security/security-timeline-types.ts
CREATE packages/core/src/security/security-timeline-manager.ts
CREATE packages/core/tests/security/security-timeline-manager.test.ts
MODIFY packages/core/src/security/index.ts
```

## Tasks

### Task 1: Define security timeline Zod schemas and types

**Depends on:** none | **Files:** `packages/core/src/security/security-timeline-types.ts`

1. Create `packages/core/src/security/security-timeline-types.ts` with:
   - `SecurityCategorySnapshotSchema` (findingCount, errorCount, warningCount, infoCount)
   - `SupplyChainSnapshotSchema` (critical, high, moderate, low, info, total)
   - `SecurityTimelineSnapshotSchema` (capturedAt, commitHash, securityScore, totalFindings, bySeverity, byCategory, supplyChain, suppressionCount, findingIds)
   - `FindingLifecycleSchema` (findingId, ruleId, category, severity, file, firstSeenAt, firstSeenCommit, resolvedAt, resolvedCommit)
   - `SecurityTimelineFileSchema` (version: 1, snapshots, findingLifecycles)
   - `SecurityTrendLineSchema`, `TrendAttributionSchema`, `SecurityTrendResultSchema`
   - `TimeToFixResultSchema`, `TimeToFixStatsSchema`
   - All corresponding TypeScript types via `z.infer`
   - `securityFindingId(finding)` utility function using SHA-256
2. Run: `npx tsc --noEmit -p packages/core/tsconfig.json` — observe pass
3. Commit: `feat(security): add security timeline Zod schemas and types`

### Task 2: Implement SecurityTimelineManager core (load, save, capture, score)

**Depends on:** Task 1 | **Files:** `packages/core/src/security/security-timeline-manager.ts`, `packages/core/tests/security/security-timeline-manager.test.ts`

1. Create test file `packages/core/tests/security/security-timeline-manager.test.ts` with tests:
   - `load()` returns empty file when no file exists
   - `capture()` appends a snapshot with correct counts
   - `capture()` deduplicates same commitHash
   - `computeSecurityScore()` returns 100 for zero findings
   - `computeSecurityScore()` returns weighted penalty score
2. Run tests — observe failure (no implementation yet)
3. Create `packages/core/src/security/security-timeline-manager.ts` with:
   - Constructor taking `rootDir`, setting path to `.harness/security/timeline.json`
   - `load()` — read & validate with Zod, return empty on missing/invalid
   - `save()` — atomic write (temp + rename), create dirs
   - `capture(scanResult, commitHash)` — aggregate findings by category/severity, compute score, append snapshot
   - `computeSecurityScore(snapshot)` — weighted formula: `100 - (errors*3 + warnings*1 + infos*0.25 + supplyChain.critical*5 + supplyChain.high*3 + supplyChain.moderate*1)`, clamped 0–100
4. Run tests — observe pass
5. Commit: `feat(security): implement SecurityTimelineManager core with capture and scoring`

### Task 3: Implement supply chain capture (npm audit parsing)

**Depends on:** Task 2 | **Files:** `packages/core/src/security/security-timeline-manager.ts`, `packages/core/tests/security/security-timeline-manager.test.ts`

1. Add tests:
   - `captureSupplyChain()` returns zero counts when npm audit has no vulnerabilities
   - `captureSupplyChain()` parses npm audit JSON correctly
   - `captureSupplyChain()` returns zero counts when npm audit fails (no npm, no package.json)
2. Run tests — observe failure
3. Implement `captureSupplyChain()`:
   - Run `npm audit --json` via `execSync` with try/catch
   - Parse JSON output, extract `metadata.vulnerabilities` (npm v7+ format)
   - Map to `SupplyChainSnapshot`: critical, high, moderate, low, info, total
   - Return zeroed snapshot on failure
4. Run tests — observe pass
5. Commit: `feat(security): add supply chain monitoring via npm audit`

### Task 4: Implement finding lifecycle tracking and time-to-fix

**Depends on:** Task 2 | **Files:** `packages/core/src/security/security-timeline-manager.ts`, `packages/core/tests/security/security-timeline-manager.test.ts`

1. Add tests:
   - `updateLifecycles()` adds new findings with firstSeenAt
   - `updateLifecycles()` marks resolved findings with resolvedAt
   - `computeTimeToFix()` computes correct mean/median for resolved findings
   - `computeTimeToFix()` returns overall and byCategory breakdowns
   - `computeTimeToFix()` handles no resolved findings (returns zero counts)
2. Run tests — observe failure
3. Implement:
   - `updateLifecycles(currentFindings, commitHash)` — compare current finding IDs vs existing lifecycles; add new entries; mark resolved entries with resolvedAt/resolvedCommit
   - `computeTimeToFix(options?)` — filter resolved lifecycles, compute mean/median days, group by category
4. Run tests — observe pass
5. Commit: `feat(security): add vulnerability time-to-fix tracking`

### Task 5: Implement trends with attribution

**Depends on:** Task 2 | **Files:** `packages/core/src/security/security-timeline-manager.ts`, `packages/core/tests/security/security-timeline-manager.test.ts`

1. Add tests:
   - `trends()` returns empty result for 0 snapshots
   - `trends()` returns stable for single snapshot
   - `trends()` computes directional trends between first and last
   - `trends()` includes attribution entries for changed categories
   - `trends()` respects `last` and `since` options
2. Run tests — observe failure
3. Implement `trends(options?)`:
   - Load snapshots, apply `since`/`last` filters
   - Compare first vs last snapshot: score trend, totalFindings trend, bySeverity trends
   - Supply chain trend (total advisories)
   - Attribution: for each category, compute delta and direction; include entries with non-zero delta
4. Run tests — observe pass
5. Commit: `feat(security): add security trend analysis with attribution`

### Task 6: Wire exports into security module index

**Depends on:** Tasks 1–5 | **Files:** `packages/core/src/security/index.ts`

1. Add exports to `packages/core/src/security/index.ts`:
   - All Zod schemas from `security-timeline-types.ts`
   - All TypeScript types from `security-timeline-types.ts`
   - `securityFindingId` utility from `security-timeline-types.ts`
   - `SecurityTimelineManager` class from `security-timeline-manager.ts`
2. Run: `npx tsc --noEmit -p packages/core/tsconfig.json` — observe pass
3. Run: `npx vitest run packages/core/tests/security/security-timeline-manager.test.ts` — observe pass
4. Commit: `feat(security): export security timeline types and manager`
