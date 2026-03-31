import type { UsageRecord, SessionUsage, DailyUsage, TokenUsage } from '@harness-engineering/types';

/**
 * Internal record type that carries an optional _source tag for merge logic.
 */
type TaggedRecord = UsageRecord & { _source?: 'harness' | 'claude-code' };

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

  const sessionMap = new Map<
    string,
    {
      harnessRecords: TaggedRecord[];
      ccRecords: TaggedRecord[];
      allRecords: TaggedRecord[];
    }
  >();

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

  const results: SessionUsage[] = [];

  for (const [sessionId, bucket] of sessionMap) {
    const hasHarness = bucket.harnessRecords.length > 0;
    const hasCC = bucket.ccRecords.length > 0;
    const isMerged = hasHarness && hasCC;

    // Use harness records for token counts when available, otherwise CC
    const tokenSource = hasHarness ? bucket.harnessRecords : bucket.ccRecords;

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

      if (r.costMicroUSD != null && costMicroUSD != null) {
        costMicroUSD += r.costMicroUSD;
      } else if (r.costMicroUSD == null) {
        costMicroUSD = null;
      }

      if (!model && r.model) {
        model = r.model;
      }
    }

    // Supplement model from CC records if not found in harness records
    if (!model && hasCC) {
      for (const r of bucket.ccRecords) {
        if (r.model) {
          model = r.model;
          break;
        }
      }
    }

    // Timestamps from all records
    const timestamps = bucket.allRecords.map((r) => r.timestamp).sort();

    const source: SessionUsage['source'] = isMerged ? 'merged' : hasCC ? 'claude-code' : 'harness';

    const session: SessionUsage = {
      sessionId,
      firstTimestamp: timestamps[0],
      lastTimestamp: timestamps[timestamps.length - 1],
      tokens,
      model,
      costMicroUSD,
      source,
    };

    if (cacheCreation != null) session.cacheCreationTokens = cacheCreation;
    if (cacheRead != null) session.cacheReadTokens = cacheRead;

    results.push(session);
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

  const dayMap = new Map<
    string,
    {
      sessions: Set<string>;
      tokens: TokenUsage;
      cacheCreation?: number;
      cacheRead?: number;
      costMicroUSD: number | null;
      models: Set<string>;
    }
  >();

  for (const record of records) {
    const date = record.timestamp.slice(0, 10); // YYYY-MM-DD

    if (!dayMap.has(date)) {
      dayMap.set(date, {
        sessions: new Set(),
        tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        costMicroUSD: 0,
        models: new Set(),
      });
    }
    const day = dayMap.get(date)!;

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

    if (record.costMicroUSD != null && day.costMicroUSD != null) {
      day.costMicroUSD += record.costMicroUSD;
    } else if (record.costMicroUSD == null) {
      day.costMicroUSD = null;
    }

    if (record.model) {
      day.models.add(record.model);
    }
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
