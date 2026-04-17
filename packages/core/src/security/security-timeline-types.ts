import { createHash } from 'node:crypto';
import { z } from 'zod';

// --- Security Category Snapshot ---

export const SecurityCategorySnapshotSchema = z.object({
  findingCount: z.number(),
  errorCount: z.number(),
  warningCount: z.number(),
  infoCount: z.number(),
});

export type SecurityCategorySnapshot = z.infer<typeof SecurityCategorySnapshotSchema>;

// --- Supply Chain Snapshot ---

export const SupplyChainSnapshotSchema = z.object({
  critical: z.number(),
  high: z.number(),
  moderate: z.number(),
  low: z.number(),
  info: z.number(),
  total: z.number(),
});

export type SupplyChainSnapshot = z.infer<typeof SupplyChainSnapshotSchema>;

// --- Security Timeline Snapshot ---

export const SecurityTimelineSnapshotSchema = z.object({
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
  findingIds: z.array(z.string()),
});

export type SecurityTimelineSnapshot = z.infer<typeof SecurityTimelineSnapshotSchema>;

// --- Finding Lifecycle ---

export const FindingLifecycleSchema = z.object({
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

export type FindingLifecycle = z.infer<typeof FindingLifecycleSchema>;

// --- Security Timeline File ---

export const SecurityTimelineFileSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(SecurityTimelineSnapshotSchema),
  findingLifecycles: z.array(FindingLifecycleSchema),
});

export type SecurityTimelineFile = z.infer<typeof SecurityTimelineFileSchema>;

// --- Trend Types ---

export const DirectionSchema = z.enum(['improving', 'stable', 'declining']);
export type Direction = z.infer<typeof DirectionSchema>;

export const SecurityTrendLineSchema = z.object({
  current: z.number(),
  previous: z.number(),
  delta: z.number(),
  direction: DirectionSchema,
});

export type SecurityTrendLine = z.infer<typeof SecurityTrendLineSchema>;

export const TrendAttributionSchema = z.object({
  category: z.string(),
  delta: z.number(),
  direction: DirectionSchema,
  description: z.string(),
});

export type TrendAttribution = z.infer<typeof TrendAttributionSchema>;

export const SecurityTrendResultSchema = z.object({
  score: SecurityTrendLineSchema,
  totalFindings: SecurityTrendLineSchema,
  bySeverity: z.object({
    error: SecurityTrendLineSchema,
    warning: SecurityTrendLineSchema,
    info: SecurityTrendLineSchema,
  }),
  supplyChain: SecurityTrendLineSchema,
  snapshotCount: z.number(),
  from: z.string(),
  to: z.string(),
  attribution: z.array(TrendAttributionSchema),
});

export type SecurityTrendResult = z.infer<typeof SecurityTrendResultSchema>;

// --- Time-to-Fix Types ---

export const TimeToFixStatsSchema = z.object({
  mean: z.number(),
  median: z.number(),
  count: z.number(),
});

export type TimeToFixStats = z.infer<typeof TimeToFixStatsSchema>;

export const TimeToFixResultSchema = z.object({
  overall: TimeToFixStatsSchema,
  byCategory: z.record(z.string(), TimeToFixStatsSchema),
  openFindings: z.number(),
  oldestOpenDays: z.number().nullable(),
});

export type TimeToFixResult = z.infer<typeof TimeToFixResultSchema>;

// --- Finding Identity ---

/**
 * Compute a stable finding ID from a security finding.
 * Uses SHA-256 of ruleId + relativePath + normalized match text.
 */
export function securityFindingId(finding: {
  ruleId: string;
  file: string;
  match: string;
}): string {
  const normalized = `${finding.ruleId}:${finding.file}:${finding.match.trim()}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// --- Empty/default constructors ---

export const EMPTY_SUPPLY_CHAIN: SupplyChainSnapshot = {
  critical: 0,
  high: 0,
  moderate: 0,
  low: 0,
  info: 0,
  total: 0,
};
