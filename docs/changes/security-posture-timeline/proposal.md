# Security Posture Timeline

**Keywords:** security-posture, timeline, supply-chain, vulnerability, time-to-fix, trend-attribution, npm-audit, snapshots
**Status:** Proposed

## Overview

Security scans today are point-in-time: `SecurityScanner` produces a `ScanResult` with findings, but there is no historical tracking. Teams cannot answer "are we getting more or less secure over months?" or "how long do vulnerabilities stay open?"

This feature adds a `SecurityTimelineManager` that captures security metric snapshots over time, integrates supply chain monitoring via `npm audit`, tracks vulnerability time-to-fix, and provides trend attribution to explain _why_ security posture is changing.

## Goals

1. **Snapshot capture:** Record security scan results as timestamped snapshots with per-category and per-severity breakdowns.
2. **Supply chain monitoring:** Capture npm audit advisory counts by severity as part of each snapshot.
3. **Time-to-fix tracking:** Track when findings first appear and when they are resolved, computing mean/median time-to-fix per category.
4. **Trend computation:** Compare snapshots over time to determine whether security posture is improving, stable, or declining.
5. **Trend attribution:** Attribute posture changes to specific categories and severity shifts between snapshots.
6. **Composite security score:** Compute a 0–100 security health score analogous to the architecture stability score.

## Non-Goals

- Real-time alerting or webhook notifications.
- CVE database lookups or NVD integration.
- Dashboard UI (separate initiative).
- External SIEM or vulnerability management tool integration.
- Replacing `SecurityScanner` — this builds on top of its output.

## Decisions

| #   | Decision            | Choice                                                                | Rationale                                                                              |
| --- | ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Module location     | `packages/core/src/security/`                                         | Co-located with existing security infrastructure; same architectural layer.            |
| 2   | Data model pattern  | Mirror architecture timeline (Zod schemas, manager class, atomic I/O) | Proven pattern in `architecture/timeline-manager.ts`; consistent developer experience. |
| 3   | Storage path        | `.harness/security/timeline.json`                                     | Parallel to `.harness/arch/timeline.json`; keeps security data separate.               |
| 4   | Supply chain source | Parse `npm audit --json` output                                       | No new dependencies; works with any npm project; synchronous child_process call.       |
| 5   | Finding identity    | Stable hash of `ruleId + file + line` for deduplication               | Enables time-to-fix tracking by matching findings across snapshots.                    |
| 6   | Score computation   | Weighted severity model: error=3, warning=1, info=0.25                | Prioritizes high-severity findings in the composite score.                             |

## Technical Design

### Data Model

```typescript
// security-timeline-types.ts

const SecurityCategorySnapshotSchema = z.object({
  findingCount: z.number(),
  errorCount: z.number(),
  warningCount: z.number(),
  infoCount: z.number(),
});

const SupplyChainSnapshotSchema = z.object({
  critical: z.number(),
  high: z.number(),
  moderate: z.number(),
  low: z.number(),
  info: z.number(),
  total: z.number(),
});

const SecurityTimelineSnapshotSchema = z.object({
  capturedAt: z.string().datetime(),
  commitHash: z.string(),
  securityScore: z.number().min(0).max(100),
  totalFindings: z.number(),
  bySeverity: z.object({
    error: z.number(),
    warning: z.number(),
    info: z.number(),
  }),
  byCategory: z.record(z.string(), SecurityCategorySnapshotSchema),
  supplyChain: SupplyChainSnapshotSchema,
  suppressionCount: z.number(),
  findingIds: z.array(z.string()), // stable IDs for time-to-fix tracking
});

const FindingLifecycleSchema = z.object({
  findingId: z.string(),
  ruleId: z.string(),
  category: z.string(),
  severity: z.string(),
  file: z.string(),
  firstSeenAt: z.string().datetime(),
  firstSeenCommit: z.string(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedCommit: z.string().nullable(),
});

const SecurityTimelineFileSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(SecurityTimelineSnapshotSchema),
  findingLifecycles: z.array(FindingLifecycleSchema),
});
```

### SecurityTimelineManager API

```typescript
class SecurityTimelineManager {
  constructor(rootDir: string);

  // Core operations
  load(): SecurityTimelineFile;
  save(file: SecurityTimelineFile): void;
  capture(scanResult: ScanResult, commitHash: string): SecurityTimelineSnapshot;

  // Supply chain
  captureSupplyChain(): SupplyChainSnapshot;

  // Time-to-fix
  updateLifecycles(currentFindings: SecurityFinding[], commitHash: string): void;
  computeTimeToFix(options?: { category?: string; since?: string }): TimeToFixResult;

  // Trends
  trends(options?: { last?: number; since?: string }): SecurityTrendResult;

  // Score
  computeSecurityScore(snapshot: SecurityTimelineSnapshot): number;
}
```

### Security Score Computation

```
score = max(0, 100 - weightedPenalty)
weightedPenalty = (errors × 3) + (warnings × 1) + (infos × 0.25) + (supplyChain.critical × 5) + (supplyChain.high × 3) + (supplyChain.moderate × 1)
```

Score is clamped to 0–100. A project with zero findings and zero advisories scores 100.

### Trend Result

```typescript
interface SecurityTrendResult {
  score: { current: number; previous: number; delta: number; direction: Direction };
  totalFindings: { current: number; previous: number; delta: number; direction: Direction };
  bySeverity: Record<SecuritySeverity, TrendLine>;
  supplyChain: { current: number; previous: number; delta: number; direction: Direction };
  snapshotCount: number;
  from: string;
  to: string;
  attribution: TrendAttribution[];
}

interface TrendAttribution {
  category: string;
  delta: number;
  direction: Direction;
  description: string; // e.g., "+3 injection findings", "-2 secrets findings"
}
```

### Time-to-Fix Result

```typescript
interface TimeToFixResult {
  overall: { mean: number; median: number; count: number }; // days
  byCategory: Record<string, { mean: number; median: number; count: number }>;
  openFindings: number;
  oldestOpenDays: number | null;
}
```

### Finding Identity

Stable finding ID: `sha256(ruleId + ':' + relativePath + ':' + normalizedMatch)` — matches the violation ID pattern in `architecture/types.ts:21`.

## File Map

| Action | File                                                             |
| ------ | ---------------------------------------------------------------- |
| CREATE | `packages/core/src/security/security-timeline-types.ts`          |
| CREATE | `packages/core/src/security/security-timeline-manager.ts`        |
| MODIFY | `packages/core/src/security/index.ts`                            |
| CREATE | `packages/core/tests/security/security-timeline-manager.test.ts` |

## Success Criteria

1. When a security scan completes, `capture()` records a snapshot with per-category and per-severity breakdowns.
2. When `captureSupplyChain()` runs, npm audit advisory counts are included in the snapshot.
3. When findings appear and later disappear across snapshots, `computeTimeToFix()` returns accurate mean/median resolution times.
4. When `trends()` is called with multiple snapshots, it returns directional trends with attribution.
5. When `computeSecurityScore()` runs, it produces a 0–100 score weighted by severity.
6. All types are validated via Zod schemas and exported from the security module index.

## Implementation Order

1. **Types and schemas** — Zod schemas and TypeScript types for all data structures.
2. **Manager core** — `SecurityTimelineManager` with `load()`, `save()`, `capture()`, `computeSecurityScore()`.
3. **Supply chain** — `captureSupplyChain()` with npm audit JSON parsing.
4. **Time-to-fix** — Finding lifecycle tracking and `computeTimeToFix()`.
5. **Trends** — `trends()` with trend attribution.
6. **Export wiring** — Add exports to security module index.
