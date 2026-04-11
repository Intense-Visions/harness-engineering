import { readAdoptionRecords, aggregateBySkill } from '@harness-engineering/core';
import type { AdoptionSnapshot } from '@harness-engineering/types';

/**
 * Gather adoption telemetry data from .harness/metrics/adoption.jsonl.
 * Returns an AdoptionSnapshot with top skills and totals.
 */
export function gatherAdoption(projectPath: string): AdoptionSnapshot {
  const records = readAdoptionRecords(projectPath);
  const topSkills = aggregateBySkill(records).slice(0, 20);

  return {
    period: 'all-time',
    totalInvocations: records.length,
    uniqueSkills: new Set(records.map((r) => r.skill)).size,
    topSkills,
    generatedAt: new Date().toISOString(),
  };
}
