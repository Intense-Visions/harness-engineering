import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Summary } from '@harness-engineering/burn';
import type { SpendEnvelopeVerdict } from '@harness-engineering/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BUDGET_EXHAUSTED_EXIT_CODE,
  envelopeFromOptions,
  observedSpendFromSummary,
  runBudgetCheck,
} from './budget-check';

/** Minimal burn summary fixture with a global (wtd) spend and one per-fleet skill block. */
function summary(over: Partial<Summary> = {}): Summary {
  return {
    generated_at: '2026-08-27T20:00:00+00:00',
    scan: { files_total: 1, files_rescanned: 0, records_added: 0, records_total: 1 },
    status: 'OK',
    week: {
      start: '2026-08-26T14:00:00+00:00',
      reset_at: '2026-09-02T14:00:00+00:00',
      reset_spec: '2@09:00 America/Chicago',
      tz: 'America/Chicago',
      elapsed_frac: 0.1,
      days_left: 6,
      hours_left: 144,
    },
    wtd: { requests: 10, output_tokens: 100, units: 500_000_000 },
    baseline: { complete_weeks_used: 0, median_units: null, max_units: null, per_week_back: {} },
    projection: {
      units_at_reset: 0,
      units_at_reset_linear: 0,
      method: 'linear',
      ratio_vs_baseline: null,
      confidence: 'low',
    },
    budget: { set: false },
    calibration: {},
    models: {},
    models_exhausted: [],
    agents: {},
    skills: {
      'harness:roadmap-fleet': { requests: 5, units: 300_000_000, pct_of_week: 0.6, lanes: 3 },
    },
    attribution: {
      attributed_units: 0,
      main_units: 0,
      unattributed_units: 0,
      pre_migration_units: 0,
      lanes: 3,
      degraded: false,
    },
    session: { window_hours: 5, requests: 5, units: 100 },
    ...over,
  } as Summary;
}

/** Drive the REAL callable end-to-end against a burn summary.json on disk. */
function runAgainst(
  sum: Summary | null,
  opts: Parameters<typeof runBudgetCheck>[0]
): { code: number; verdict: SpendEnvelopeVerdict } {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'burn-state-'));
  mkdirSync(stateDir, { recursive: true });
  if (sum) writeFileSync(path.join(stateDir, 'summary.json'), JSON.stringify(sum));
  const prev = process.env.CLAUDE_HUD_STATE;
  process.env.CLAUDE_HUD_STATE = stateDir;
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
    logs.push(String(m));
  });
  try {
    // noRefresh: never rescan real transcripts in a unit test.
    const code = runBudgetCheck({ ...opts, noRefresh: true, json: true });
    return { code, verdict: JSON.parse(logs[0] ?? '{}') as SpendEnvelopeVerdict };
  } finally {
    spy.mockRestore();
    if (prev === undefined) delete process.env.CLAUDE_HUD_STATE;
    else process.env.CLAUDE_HUD_STATE = prev;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('observedSpendFromSummary', () => {
  it('reads global from wtd.units and per-fleet from the skills block', () => {
    const observed = observedSpendFromSummary(summary(), 'roadmap-fleet');
    expect(observed.global).toBe(500_000_000);
    expect(observed.perFleet?.['roadmap-fleet']).toBe(300_000_000);
  });

  it('is zero-spend when there is no summary (never fakes a green from missing data)', () => {
    expect(observedSpendFromSummary(null)).toEqual({ global: 0 });
  });
});

describe('runBudgetCheck (WIRED: DISPATCH callable → core primitive)', () => {
  it('reports EXHAUSTED when burn-observed spend exceeds the envelope', () => {
    const { code, verdict } = runAgainst(summary(), { envelope: '400M' });
    expect(verdict.status).toBe('exhausted');
    if (verdict.status === 'exhausted') expect(verdict.scope).toBe('global');
    expect(code).toBe(BUDGET_EXHAUSTED_EXIT_CODE);
  });

  it('reports WITHIN when burn-observed spend is under the envelope', () => {
    const { code, verdict } = runAgainst(summary(), { envelope: '1B' });
    expect(verdict.status).toBe('within');
    expect(code).toBe(0);
  });

  it('reports EXHAUSTED (fleet) when a per-fleet sub-allocation is spent while global has room', () => {
    const { code, verdict } = runAgainst(summary(), {
      envelope: '1B',
      fleet: 'roadmap-fleet',
      fleetEnvelope: '200M',
    });
    expect(verdict.status).toBe('exhausted');
    if (verdict.status === 'exhausted') {
      expect(verdict.scope).toBe('fleet');
      expect(verdict.fleet).toBe('roadmap-fleet');
    }
    expect(code).toBe(BUDGET_EXHAUSTED_EXIT_CODE);
  });

  it('is a no-op (unconfigured, exit 0) when no envelope is configured', () => {
    const { code, verdict } = runAgainst(summary(), {});
    expect(verdict.status).toBe('unconfigured');
    expect(code).toBe(0);
  });
});

describe('envelopeFromOptions', () => {
  it('returns undefined (no-op) with no --envelope', () => {
    expect(envelopeFromOptions({})).toBeUndefined();
  });

  it('parses k/M/B suffixes', () => {
    expect(envelopeFromOptions({ envelope: '250M' })?.envelopeTokens).toBe(250_000_000);
  });
});
