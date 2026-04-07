import type { UsageRecord, SessionUsage, DailyUsage, TokenUsage } from '@harness-engineering/types';

/**
 * Internal record type that carries an optional _source tag for merge logic.
 */
type TaggedRecord = UsageRecord & { _source?: 'harness' | 'claude-code' };

/**
 * Internal bucket for grouping records by session.
 */
interface SessionBucket {
  harnessRecords: TaggedRecord[];
  ccRecords: TaggedRecord[];
  allRecords: TaggedRecord[];
}

/**
 * Accumulated totals from summing a set of records.
 */
interface RecordTotals {
  tokens: TokenUsage;
  cacheCreation: number | undefined;
  cacheRead: number | undefined;
  costMicroUSD: number | null;
  model: string | undefined;
}

/**
 * Internal accumulator for day-level aggregation.
 */
interface DayBucket {
  sessions: Set<string>;
  tokens: TokenUsage;
  cacheCreation?: number;
  cacheRead?: number;
  costMicroUSD: number | null;
  models: Set<string>;
}

// ---------------------------------------------------------------------------
// Extracted helpers
// ---------------------------------------------------------------------------

/**
 * Groups records into per-session buckets, classifying each by source tag.
 */
function bucketRecordsBySession(records: UsageRecord[]): Map<string, SessionBucket> {
  const sessionMap = new Map<string, SessionBucket>();

  for (const record of records) {
    const tagged = record as TaggedRecord;
    const id = record.sessionId;

    if (!sessionMap.has(id)) {
      sessionMap.set(id, { harnessRecords: [], ccRecords: [], allRecords: [] });
    }
    const bucket = sessionMap.get(id)!;

    if (tagged._source === 'claude-code') {
      bucket.ccRecords.push(tagged);
    } else {
      bucket.harnessRecords.push(tagged);
    }
    bucket.allRecords.push(tagged);
  }

  return sessionMap;
}

/**
 * Accumulates cost from a single record into a running total.
 * Returns null if any record has unknown pricing (null cost).
 */
function accumulateCost(
  running: number | null,
  recordCost: number | null | undefined
): number | null {
  if (recordCost != null && running != null) {
    return running + recordCost;
  }
  if (recordCost == null) {
    return null;
  }
  return running;
}

/**
 * Sums tokens, cache fields, cost, and picks the first model from a list of records.
 */
function sumRecordTokens(tokenSource: UsageRecord[]): RecordTotals {
  const tokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let cacheCreation: number | undefined;
  let cacheRead: number | undefined;
  let costMicroUSD: number | null = 0;
  let model: string | undefined;

  for (const r of tokenSource) {
    tokens.inputTokens += r.tokens.inputTokens;
    tokens.outputTokens += r.tokens.outputTokens;
    tokens.totalTokens += r.tokens.totalTokens;

    if (r.cacheCreationTokens != null) {
      cacheCreation = (cacheCreation ?? 0) + r.cacheCreationTokens;
    }
    if (r.cacheReadTokens != null) {
      cacheRead = (cacheRead ?? 0) + r.cacheReadTokens;
    }

    costMicroUSD = accumulateCost(costMicroUSD, r.costMicroUSD);

    if (!model && r.model) {
      model = r.model;
    }
  }

  return { tokens, cacheCreation, cacheRead, costMicroUSD, model };
}

/**
 * Finds the first model string in a list of records, or undefined if none.
 */
function findModel(records: UsageRecord[]): string | undefined {
  for (const r of records) {
    if (r.model) return r.model;
  }
  return undefined;
}

/**
 * Builds a SessionUsage object from a session bucket's computed values.
 */
function determineSource(hasHarness: boolean, hasCC: boolean): SessionUsage['source'] {
  if (hasHarness && hasCC) return 'merged';
  if (hasCC) return 'claude-code';
  return 'harness';
}

function applyOptionalFields(
  session: SessionUsage,
  totals: RecordTotals,
  model: string | undefined
): void {
  if (model) session.model = model;
  if (totals.cacheCreation != null) session.cacheCreationTokens = totals.cacheCreation;
  if (totals.cacheRead != null) session.cacheReadTokens = totals.cacheRead;
}

function buildSessionUsage(sessionId: string, bucket: SessionBucket): SessionUsage {
  const hasHarness = bucket.harnessRecords.length > 0;
  const hasCC = bucket.ccRecords.length > 0;
  const tokenSource = hasHarness ? bucket.harnessRecords : bucket.ccRecords;
  const totals = sumRecordTokens(tokenSource);
  const model = totals.model ?? (hasCC ? findModel(bucket.ccRecords) : undefined);
  const timestamps = bucket.allRecords.map((r) => r.timestamp).sort();

  const session: SessionUsage = {
    sessionId,
    firstTimestamp: timestamps[0] ?? '',
    lastTimestamp: timestamps[timestamps.length - 1] ?? '',
    tokens: totals.tokens,
    costMicroUSD: totals.costMicroUSD,
    source: determineSource(hasHarness, hasCC),
  };

  applyOptionalFields(session, totals, model);
  return session;
}

/**
 * Accumulates a single record's data into a day bucket (mutates the bucket).
 */
function accumulateIntoDayBucket(day: DayBucket, record: UsageRecord): void {
  day.sessions.add(record.sessionId);
  day.tokens.inputTokens += record.tokens.inputTokens;
  day.tokens.outputTokens += record.tokens.outputTokens;
  day.tokens.totalTokens += record.tokens.totalTokens;

  if (record.cacheCreationTokens != null) {
    day.cacheCreation = (day.cacheCreation ?? 0) + record.cacheCreationTokens;
  }
  if (record.cacheReadTokens != null) {
    day.cacheRead = (day.cacheRead ?? 0) + record.cacheReadTokens;
  }

  day.costMicroUSD = accumulateCost(day.costMicroUSD, record.costMicroUSD);

  if (record.model) {
    day.models.add(record.model);
  }
}

/**
 * Creates a fresh day bucket with zeroed accumulators.
 */
function createDayBucket(): DayBucket {
  return {
    sessions: new Set(),
    tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    costMicroUSD: 0,
    models: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Public API (signatures unchanged)
// ---------------------------------------------------------------------------

/**
 * Aggregates an array of UsageRecords into per-session summaries.
 *
 * When records from both harness and Claude Code sources share a session ID:
 * - Harness token counts are authoritative
 * - CC data supplements the model field
 * - The result is marked as 'merged'
 */
export function aggregateBySession(records: UsageRecord[]): SessionUsage[] {
  if (records.length === 0) return [];

  const sessionMap = bucketRecordsBySession(records);
  const results: SessionUsage[] = [];

  for (const [sessionId, bucket] of sessionMap) {
    results.push(buildSessionUsage(sessionId, bucket));
  }

  // Sort by firstTimestamp descending (most recent first)
  results.sort((a, b) => b.firstTimestamp.localeCompare(a.firstTimestamp));

  return results;
}

/**
 * Aggregates an array of UsageRecords into per-day summaries.
 * Groups by calendar date (UTC) derived from the record timestamp.
 */
export function aggregateByDay(records: UsageRecord[]): DailyUsage[] {
  if (records.length === 0) return [];

  const dayMap = new Map<string, DayBucket>();

  for (const record of records) {
    const date = record.timestamp.slice(0, 10); // YYYY-MM-DD

    if (!dayMap.has(date)) {
      dayMap.set(date, createDayBucket());
    }

    accumulateIntoDayBucket(dayMap.get(date)!, record);
  }

  const results: DailyUsage[] = [];

  for (const [date, day] of dayMap) {
    const entry: DailyUsage = {
      date,
      sessionCount: day.sessions.size,
      tokens: day.tokens,
      costMicroUSD: day.costMicroUSD,
      models: Array.from(day.models).sort(),
    };

    if (day.cacheCreation != null) entry.cacheCreationTokens = day.cacheCreation;
    if (day.cacheRead != null) entry.cacheReadTokens = day.cacheRead;

    results.push(entry);
  }

  // Sort by date descending (most recent first)
  results.sort((a, b) => b.date.localeCompare(a.date));

  return results;
}
