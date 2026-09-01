import { describe, it, expect } from 'vitest';
import { buildSpendLedgerFromTelemetry } from './adapter';
import { buildMetabolismReport } from './report';
import type { SkillInvocationRecord, UsageRecord } from '@harness-engineering/types';

function inv(partial: Partial<SkillInvocationRecord>): SkillInvocationRecord {
  return {
    skill: 'harness-autopilot',
    session: 's1',
    startedAt: '2026-08-31T00:00:00.000Z',
    duration: 1000,
    outcome: 'completed',
    phasesReached: [],
    ...partial,
  };
}

function usage(sessionId: string, totalTokens: number): UsageRecord {
  return {
    sessionId,
    timestamp: '2026-08-31T00:00:00.000Z',
    tokens: { inputTokens: totalTokens, outputTokens: 0, totalTokens },
  };
}

describe('buildSpendLedgerFromTelemetry', () => {
  it('returns an empty ledger for empty inputs (never throws)', () => {
    const ledger = buildSpendLedgerFromTelemetry({ invocations: [], usageRecords: [] });
    expect(ledger.events).toEqual([]);
    expect(ledger.tokenSourceCounts).toEqual({ measured: 0, 'duration-proxy': 0 });
  });

  it('apportions a session token total across invocations by duration weight', () => {
    const invocations = [
      inv({ session: 's1', skill: 'a', duration: 3000 }),
      inv({ session: 's1', skill: 'b', duration: 1000 }),
    ];
    const usageRecords = [usage('s1', 4000)];
    const ledger = buildSpendLedgerFromTelemetry({ invocations, usageRecords });

    expect(ledger.events).toHaveLength(2);
    const a = ledger.events.find((e) => e.workflowClass === 'a')!;
    const b = ledger.events.find((e) => e.workflowClass === 'b')!;
    // 3:1 duration split of 4000 tokens.
    expect(a.tokens).toBeCloseTo(3000, 6);
    expect(b.tokens).toBeCloseTo(1000, 6);
    // Apportioned tokens sum back to the session total.
    expect(a.tokens + b.tokens).toBeCloseTo(4000, 6);
    expect(a.tokenSource).toBe('measured');
    expect(ledger.tokenSourceCounts.measured).toBe(2);
  });

  it('splits evenly when durations are all zero', () => {
    const invocations = [
      inv({ session: 's1', skill: 'a', duration: 0 }),
      inv({ session: 's1', skill: 'b', duration: 0 }),
    ];
    const ledger = buildSpendLedgerFromTelemetry({
      invocations,
      usageRecords: [usage('s1', 1000)],
    });
    expect(ledger.events.map((e) => e.tokens)).toEqual([500, 500]);
  });

  it('falls back to duration as the burn proxy when a session has no usage record', () => {
    const invocations = [inv({ session: 'orphan', skill: 'a', duration: 750 })];
    const ledger = buildSpendLedgerFromTelemetry({ invocations, usageRecords: [] });
    expect(ledger.events[0]?.tokens).toBe(750);
    expect(ledger.events[0]?.tokenSource).toBe('duration-proxy');
    expect(ledger.tokenSourceCounts['duration-proxy']).toBe(1);
  });

  it('labels maintenance-class invocations with a maintenanceLoop for decomposition', () => {
    const invocations = [
      inv({ session: 's1', skill: 'graph-refresh', duration: 1000 }),
      inv({ session: 's1', skill: 'harness-autopilot', duration: 1000 }),
    ];
    const ledger = buildSpendLedgerFromTelemetry({
      invocations,
      usageRecords: [usage('s1', 2000)],
    });
    const gr = ledger.events.find((e) => e.workflowClass === 'graph-refresh')!;
    const ap = ledger.events.find((e) => e.workflowClass === 'harness-autopilot')!;
    expect(gr.maintenanceLoop).toBe('graph-refresh');
    expect(ap.maintenanceLoop).toBeUndefined();
  });

  it('carries outcome linkage through to a report end-to-end', () => {
    const invocations = [
      inv({ session: 's1', skill: 'harness-autopilot', outcome: 'completed', duration: 1000 }),
      inv({ session: 's1', skill: 'graph-refresh', outcome: 'completed', duration: 1000 }),
      inv({ session: 's1', skill: 'reverification', outcome: 'failed', duration: 1000 }),
    ];
    const ledger = buildSpendLedgerFromTelemetry({
      invocations,
      usageRecords: [usage('s1', 3000)],
    });
    const report = buildMetabolismReport(ledger.events);
    // autopilot completed → anabolic (1000); graph-refresh + reverification → basal (2000).
    expect(report.anabolicTokens).toBeCloseTo(1000, 6);
    expect(report.basalTokens).toBeCloseTo(2000, 6);
    expect(report.basalShare).toBeCloseTo(2000 / 3000, 6);
    expect(report.rankedWaste[0]?.loop).toBeDefined();
  });
});
