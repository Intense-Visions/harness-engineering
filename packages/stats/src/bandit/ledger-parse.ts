import type { Pull } from '@harness-engineering/types';

/**
 * One clause each of the spec's malformed-line definition ("Ledger"): not valid
 * JSON, missing a required `Pull` field (or wrong type), `ts` not ISO-8601,
 * `reward.outcome` outside [0, 1], `reward.costUsd` negative.
 */
export type MalformedReason =
  | 'invalid-json'
  | 'missing-field'
  | 'bad-timestamp'
  | 'outcome-out-of-range'
  | 'negative-cost';

export type ParsedLine = { ok: true; pull: Pull } | { ok: false; reason: MalformedReason };

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasIdentity(v: Record<string, unknown>): boolean {
  return (
    typeof v.ts === 'string' &&
    typeof v.consumer === 'string' &&
    typeof v.context === 'string' &&
    typeof v.arm === 'string' &&
    (v.mode === 'exploit' || v.mode === 'explore') &&
    (v.ref === undefined || typeof v.ref === 'string')
  );
}

function isIsoTimestamp(ts: string): boolean {
  return ISO_PREFIX.test(ts) && !Number.isNaN(Date.parse(ts));
}

function rewardReason(reward: unknown): MalformedReason | undefined {
  if (reward === undefined) return undefined;
  if (!isRecord(reward) || typeof reward.outcome !== 'number') return 'missing-field';
  if (!(reward.outcome >= 0 && reward.outcome <= 1)) return 'outcome-out-of-range';
  if (reward.costUsd === undefined) return undefined;
  if (typeof reward.costUsd !== 'number') return 'missing-field';
  return reward.costUsd >= 0 ? undefined : 'negative-cost';
}

/** Parse one ledger line into a `Pull` or a malformed reason. Never throws. */
export function parseLine(line: string): ParsedLine {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!isRecord(value) || !hasIdentity(value)) return { ok: false, reason: 'missing-field' };
  if (!isIsoTimestamp(value.ts as string)) return { ok: false, reason: 'bad-timestamp' };
  const reason = rewardReason(value.reward);
  if (reason !== undefined) return { ok: false, reason };
  return { ok: true, pull: value as unknown as Pull };
}
