import type { SkillInvocationRecord, SkillAdoptionSummary } from '@harness-engineering/types';

/**
 * Return type for daily aggregation.
 */
export interface DailyAdoption {
  /** Calendar date (YYYY-MM-DD) */
  date: string;
  /** Number of invocations on this date */
  invocations: number;
  /** Count of distinct skills invoked on this date */
  uniqueSkills: number;
}

/**
 * Aggregates records by skill name into SkillAdoptionSummary[].
 * Sorted by invocation count descending.
 */
export function aggregateBySkill(records: SkillInvocationRecord[]): SkillAdoptionSummary[] {
  if (records.length === 0) return [];

  const skillMap = new Map<
    string,
    {
      records: SkillInvocationRecord[];
      tier?: number;
    }
  >();

  for (const record of records) {
    if (!skillMap.has(record.skill)) {
      const entry: { records: SkillInvocationRecord[]; tier?: number } = { records: [] };
      if (record.tier != null) entry.tier = record.tier;
      skillMap.set(record.skill, entry);
    }
    skillMap.get(record.skill)!.records.push(record);
  }

  const results: SkillAdoptionSummary[] = [];

  for (const [skill, bucket] of skillMap) {
    const invocations = bucket.records.length;
    const completedCount = bucket.records.filter((r) => r.outcome === 'completed').length;
    const totalDuration = bucket.records.reduce((sum, r) => sum + r.duration, 0);
    const timestamps = bucket.records.map((r) => r.startedAt).sort();

    const summary: SkillAdoptionSummary = {
      skill,
      invocations,
      successRate: completedCount / invocations,
      avgDuration: totalDuration / invocations,
      lastUsed: timestamps[timestamps.length - 1]!,
    };
    if (bucket.tier != null) summary.tier = bucket.tier;
    results.push(summary);
  }

  results.sort((a, b) => b.invocations - a.invocations);

  return results;
}

/**
 * Aggregates records by calendar date (derived from startedAt).
 * Sorted by date descending (most recent first).
 */
export function aggregateByDay(records: SkillInvocationRecord[]): DailyAdoption[] {
  if (records.length === 0) return [];

  const dayMap = new Map<string, { invocations: number; skills: Set<string> }>();

  for (const record of records) {
    const date = record.startedAt.slice(0, 10); // YYYY-MM-DD

    if (!dayMap.has(date)) {
      dayMap.set(date, { invocations: 0, skills: new Set() });
    }

    const bucket = dayMap.get(date)!;
    bucket.invocations++;
    bucket.skills.add(record.skill);
  }

  const results: DailyAdoption[] = [];

  for (const [date, bucket] of dayMap) {
    results.push({
      date,
      invocations: bucket.invocations,
      uniqueSkills: bucket.skills.size,
    });
  }

  results.sort((a, b) => b.date.localeCompare(a.date));

  return results;
}

/**
 * Returns the top N skills by invocation count.
 * Convenience wrapper over aggregateBySkill.
 */
export function topSkills(records: SkillInvocationRecord[], n: number): SkillAdoptionSummary[] {
  return aggregateBySkill(records).slice(0, n);
}
