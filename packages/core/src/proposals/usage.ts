import { readAdoptionRecords } from '../adoption/reader';

export interface SkillUsageStats {
  count: number;
  lastUsed?: string;
  windowDays: number;
}

/**
 * Derive per-skill usage stats from the existing skill_invocation telemetry
 * (`.harness/metrics/adoption.jsonl`). No new emission; this is read-only
 * aggregation surfaced explicitly on the Proposals page so reviewers can see
 * whether a refinement is touching a hot skill.
 */
export function deriveSkillUsage(
  projectRoot: string,
  skillName: string,
  windowDays = 30
): SkillUsageStats {
  const records = readAdoptionRecords(projectRoot);
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let count = 0;
  let lastUsed: string | undefined;
  for (const rec of records) {
    if (rec.skill !== skillName) continue;
    const startedMs = Date.parse(rec.startedAt);
    if (Number.isFinite(startedMs) && startedMs < cutoffMs) continue;
    count += 1;
    if (!lastUsed || rec.startedAt > lastUsed) lastUsed = rec.startedAt;
  }
  const stats: SkillUsageStats = { count, windowDays };
  if (lastUsed) stats.lastUsed = lastUsed;
  return stats;
}
