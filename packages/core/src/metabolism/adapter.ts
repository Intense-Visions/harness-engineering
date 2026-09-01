/**
 * Basal token metabolism — telemetry adapter (#1628).
 *
 * Normalizes the existing telemetry surfaces into a {@link SpendEvent} ledger
 * the classifier/report can consume, so this feature *extends* the current
 * accounting rather than inventing a parallel one:
 *
 *  - `SkillInvocationRecord` (`.harness/metrics/adoption.jsonl`) supplies the
 *    workflow class (`skill`), the outcome linkage (`outcome`,
 *    `failureCategory`), and the session + duration used to attribute tokens.
 *  - `UsageRecord` (`packages/core/src/usage`) supplies the real token
 *    magnitude per session.
 *
 * Because many invocations share one session but token totals are recorded
 * per-session, each session's measured tokens are apportioned across that
 * session's invocations weighted by `duration`. When a session has no matching
 * usage record, the invocation's `duration` is used as the burn proxy. The
 * chosen source is declared per event via {@link SpendEvent} construction and
 * summarized on the ledger result.
 */

import type { SkillInvocationRecord, UsageRecord } from '@harness-engineering/types';
import { DEFAULT_MAINTENANCE_CLASSES, type SpendEvent } from './classify';

/** How an event's token magnitude was derived. */
export type TokenSource = 'measured' | 'duration-proxy';

/** A spend event annotated with the provenance of its token magnitude. */
export interface AttributedSpendEvent extends SpendEvent {
  /** Session the underlying invocation belonged to. */
  session: string;
  /** Whether tokens came from measured usage or a duration proxy. */
  tokenSource: TokenSource;
}

/** Inputs to {@link buildSpendLedgerFromTelemetry}. */
export interface BuildSpendLedgerInputs {
  /** Skill invocation records (outcome + workflow-class surface). */
  invocations: readonly SkillInvocationRecord[];
  /** Usage records (token-magnitude surface), keyed by session id. */
  usageRecords: readonly UsageRecord[];
  /**
   * Workflow classes that are basal by nature. Defaults to
   * {@link DEFAULT_MAINTENANCE_CLASSES}. Passed through onto each event's
   * `maintenanceLoop` only when the class matches, so the ranked-waste
   * decomposition groups maintenance loops together.
   */
  maintenanceClasses?: readonly string[];
}

/** The ledger plus a small provenance summary. */
export interface SpendLedger {
  /** The normalized spend events. */
  events: AttributedSpendEvent[];
  /** Count of events whose tokens were measured vs proxied. */
  tokenSourceCounts: Record<TokenSource, number>;
}

/** Sum a session's total tokens from its usage records. */
function totalTokensBySession(usageRecords: readonly UsageRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of usageRecords) {
    const t = r.tokens?.totalTokens ?? 0;
    map.set(r.sessionId, (map.get(r.sessionId) ?? 0) + (Number.isFinite(t) && t > 0 ? t : 0));
  }
  return map;
}

/** Group invocations by session, preserving order. */
function invocationsBySession(
  invocations: readonly SkillInvocationRecord[]
): Map<string, SkillInvocationRecord[]> {
  const map = new Map<string, SkillInvocationRecord[]>();
  for (const inv of invocations) {
    const list = map.get(inv.session) ?? [];
    list.push(inv);
    map.set(inv.session, list);
  }
  return map;
}

function isMaintenance(skill: string, classes: readonly string[]): boolean {
  const lowered = skill.toLowerCase();
  return classes.some((c) => c.toLowerCase() === lowered);
}

/**
 * Apportion a session's measured token total across its invocations by
 * duration weight. Returns tokens-per-invocation aligned with `invs`. When the
 * total duration is zero, tokens are split evenly so no invocation is dropped.
 */
function apportionByDuration(invs: SkillInvocationRecord[], sessionTokens: number): number[] {
  const durations = invs.map((i) =>
    Number.isFinite(i.duration) && i.duration > 0 ? i.duration : 0
  );
  const totalDuration = durations.reduce((s, d) => s + d, 0);
  if (totalDuration > 0) {
    return durations.map((d) => (d / totalDuration) * sessionTokens);
  }
  // No usable durations — split evenly.
  const even = invs.length > 0 ? sessionTokens / invs.length : 0;
  return invs.map(() => even);
}

/**
 * Build a normalized spend ledger from the existing adoption + usage telemetry.
 *
 * Pure and total: unknown/empty inputs yield an empty ledger, never throw.
 */
export function buildSpendLedgerFromTelemetry(inputs: BuildSpendLedgerInputs): SpendLedger {
  const maintenanceClasses = inputs.maintenanceClasses ?? DEFAULT_MAINTENANCE_CLASSES;
  const sessionTokens = totalTokensBySession(inputs.usageRecords);
  const bySession = invocationsBySession(inputs.invocations);

  const events: AttributedSpendEvent[] = [];
  const tokenSourceCounts: Record<TokenSource, number> = { measured: 0, 'duration-proxy': 0 };

  for (const [session, invs] of bySession) {
    const measuredTotal = sessionTokens.get(session);
    const hasMeasured = measuredTotal != null && measuredTotal > 0;
    const tokenSource: TokenSource = hasMeasured ? 'measured' : 'duration-proxy';
    const perInvTokens = hasMeasured
      ? apportionByDuration(invs, measuredTotal)
      : invs.map((i) => (Number.isFinite(i.duration) && i.duration > 0 ? i.duration : 0));

    for (let i = 0; i < invs.length; i++) {
      const inv = invs[i]!;
      const tokens = perInvTokens[i] ?? 0;
      const maintenance = isMaintenance(inv.skill, maintenanceClasses);
      const event: AttributedSpendEvent = {
        workflowClass: inv.skill,
        tokens,
        session,
        tokenSource,
      };
      if (inv.outcome) event.outcome = inv.outcome;
      if (inv.startedAt) event.timestamp = inv.startedAt;
      if (maintenance) event.maintenanceLoop = inv.skill;
      events.push(event);
      tokenSourceCounts[tokenSource] += 1;
    }
  }

  return { events, tokenSourceCounts };
}
