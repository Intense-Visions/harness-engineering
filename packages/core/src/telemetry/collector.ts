import type { ConsentState, TelemetryEvent } from '@harness-engineering/types';
import type { SkillInvocationRecord } from '@harness-engineering/types';
import { readAdoptionRecords } from '../adoption/reader';
import { VERSION } from '../version';

/**
 * Maps a SkillInvocationRecord outcome to the TelemetryEvent outcome union.
 * 'completed' → 'success'; anything else → 'failure'.
 */
function mapOutcome(outcome: string): 'success' | 'failure' {
  return outcome === 'completed' ? 'success' : 'failure';
}

/**
 * Reads adoption.jsonl records and formats them as TelemetryEvent payloads.
 *
 * Requires an allowed ConsentState (discriminated union with allowed: true).
 * Populates OS, Node version, harness version, and optional identity fields.
 */
export function collectEvents(
  projectRoot: string,
  consent: ConsentState & { allowed: true }
): TelemetryEvent[] {
  const records = readAdoptionRecords(projectRoot);
  if (records.length === 0) return [];

  const { installId, identity } = consent;
  const distinctId = identity.alias ?? installId;

  return records.map(
    (record: SkillInvocationRecord): TelemetryEvent => ({
      event: 'skill_invocation',
      distinctId,
      timestamp: record.startedAt,
      properties: {
        installId,
        os: process.platform,
        nodeVersion: process.version,
        harnessVersion: VERSION,
        skillName: record.skill,
        duration: record.duration,
        outcome: mapOutcome(record.outcome),
        phasesReached: record.phasesReached,
        ...(identity.project ? { project: identity.project } : {}),
        ...(identity.team ? { team: identity.team } : {}),
      },
    })
  );
}
