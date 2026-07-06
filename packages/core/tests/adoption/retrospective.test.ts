import { describe, it, expect } from 'vitest';
import type { SkillInvocationRecord } from '@harness-engineering/types';
import {
  getCatalogRetrospectiveReport,
  renderRetrospectiveMarkdown,
  isAbandonedMidWorkflow,
} from '../../src/adoption/retrospective';

function makeRecord(overrides: Partial<SkillInvocationRecord> = {}): SkillInvocationRecord {
  return {
    skill: 'harness-brainstorming',
    session: 'sess-1',
    startedAt: '2026-04-09T10:00:00.000Z',
    duration: 120000,
    outcome: 'completed',
    phasesReached: [],
    ...overrides,
  };
}

const NOW = new Date('2026-07-06T00:00:00.000Z');

describe('isAbandonedMidWorkflow', () => {
  it('classifies an explicit abandoned outcome regardless of phases', () => {
    expect(isAbandonedMidWorkflow(makeRecord({ outcome: 'abandoned', phasesReached: [] }))).toBe(
      true
    );
  });

  it('classifies a non-completed run that reached at least one phase', () => {
    expect(
      isAbandonedMidWorkflow(makeRecord({ outcome: 'failed', phasesReached: ['planning'] }))
    ).toBe(true);
  });

  it('does not classify a completed run', () => {
    expect(
      isAbandonedMidWorkflow(makeRecord({ outcome: 'completed', phasesReached: ['planning'] }))
    ).toBe(false);
  });

  it('does not classify a failed run with no phases reached', () => {
    expect(isAbandonedMidWorkflow(makeRecord({ outcome: 'failed', phasesReached: [] }))).toBe(
      false
    );
  });
});

describe('getCatalogRetrospectiveReport', () => {
  it('returns an empty-but-valid report for no records', () => {
    const report = getCatalogRetrospectiveReport([], { now: NOW });
    expect(report.totalRecords).toBe(0);
    expect(report.distinctSkills).toBe(0);
    expect(report.windowStart).toBeNull();
    expect(report.windowEnd).toBeNull();
    expect(report.topInvoked).toEqual([]);
    expect(report.topFailing).toEqual([]);
    expect(report.abandonedMidWorkflow).toEqual([]);
    expect(report.staleSkills).toEqual([]);
    expect(report.coverage).toEqual({ catalogSize: null, everInvoked: null, neverInvoked: null });
  });

  it('ranks most-invoked skills descending with stable tiebreak', () => {
    const records = [
      makeRecord({ skill: 'beta' }),
      makeRecord({ skill: 'beta' }),
      makeRecord({ skill: 'alpha' }),
      makeRecord({ skill: 'alpha' }),
      makeRecord({ skill: 'gamma' }),
    ];
    const report = getCatalogRetrospectiveReport(records, { now: NOW });
    expect(report.topInvoked.map((s) => s.skill)).toEqual(['alpha', 'beta', 'gamma']);
    expect(report.topInvoked[0]!.invocations).toBe(2);
  });

  it('ranks failing skills by failure count then rate, excluding zero-failure skills', () => {
    const records = [
      // clean: 2 completed, 0 failed -> excluded
      makeRecord({ skill: 'clean' }),
      makeRecord({ skill: 'clean' }),
      // many: 3 failed of 5 -> 3 failures, 60%
      ...Array.from({ length: 3 }, () => makeRecord({ skill: 'many', outcome: 'failed' })),
      makeRecord({ skill: 'many' }),
      makeRecord({ skill: 'many' }),
      // brittle: 2 failed of 2 -> 2 failures, 100%
      makeRecord({ skill: 'brittle', outcome: 'failed' }),
      makeRecord({ skill: 'brittle', outcome: 'failed' }),
    ];
    const report = getCatalogRetrospectiveReport(records, { now: NOW });
    expect(report.topFailing.map((s) => s.skill)).toEqual(['many', 'brittle']);
    expect(report.topFailing.find((s) => s.skill === 'clean')).toBeUndefined();
  });

  it('counts abandoned-mid-workflow runs using the broadened definition', () => {
    const records = [
      makeRecord({ skill: 'quitter', outcome: 'abandoned' }),
      makeRecord({ skill: 'quitter', outcome: 'failed', phasesReached: ['planning'] }),
      makeRecord({ skill: 'quitter', outcome: 'completed' }),
      makeRecord({ skill: 'steady', outcome: 'completed', phasesReached: ['planning'] }),
    ];
    const report = getCatalogRetrospectiveReport(records, { now: NOW });
    expect(report.abandonedMidWorkflow.map((s) => s.skill)).toEqual(['quitter']);
    expect(report.abandonedMidWorkflow[0]!.abandonedMidWorkflow).toBe(2);
  });

  it('flags only ever-invoked skills quiet beyond the inactivity threshold', () => {
    const records = [
      makeRecord({ skill: 'fresh', startedAt: '2026-07-01T00:00:00.000Z' }),
      makeRecord({ skill: 'stale', startedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const report = getCatalogRetrospectiveReport(records, { now: NOW, inactiveDays: 90 });
    expect(report.staleSkills.map((s) => s.skill)).toEqual(['stale']);
    expect(report.staleSkills[0]!.daysSinceLastUse).toBeGreaterThanOrEqual(90);
  });

  it('computes telemetry coverage against the supplied catalog', () => {
    const records = [
      makeRecord({ skill: 'harness-brainstorming' }),
      makeRecord({ skill: 'cli/scan' }),
    ];
    const report = getCatalogRetrospectiveReport(records, {
      now: NOW,
      catalogSkills: ['harness-brainstorming', 'harness-pulse', 'harness-roadmap'],
    });
    // cli/scan is not a catalog skill, so it does not count toward everInvoked
    expect(report.coverage).toEqual({ catalogSize: 3, everInvoked: 1, neverInvoked: 2 });
  });

  it('derives the record window and defaults now to the latest record', () => {
    const records = [
      makeRecord({ startedAt: '2026-06-01T00:00:00.000Z' }),
      makeRecord({ startedAt: '2026-06-11T00:00:00.000Z' }),
    ];
    const report = getCatalogRetrospectiveReport(records);
    expect(report.windowStart).toBe('2026-06-01T00:00:00.000Z');
    expect(report.windowEnd).toBe('2026-06-11T00:00:00.000Z');
    expect(report.windowDays).toBe(10);
    // now defaults to the latest record, so its own last-use is 0 days old
    expect(report.topInvoked[0]!.daysSinceLastUse).toBe(0);
  });
});

describe('renderRetrospectiveMarkdown', () => {
  it('renders sections and a coverage line', () => {
    const records = [
      makeRecord({ skill: 'alpha' }),
      makeRecord({ skill: 'alpha', outcome: 'failed' }),
      makeRecord({ skill: 'beta', outcome: 'abandoned' }),
    ];
    const report = getCatalogRetrospectiveReport(records, {
      now: NOW,
      catalogSkills: ['alpha', 'beta', 'unused'],
    });
    const md = renderRetrospectiveMarkdown(report);
    expect(md).toContain('# Catalog Retrospective — 2026-07-06');
    expect(md).toContain('Top skills by invocations');
    expect(md).toContain('Top failing skills');
    expect(md).toContain('Abandoned mid-workflow');
    expect(md).toContain('2/3 catalog skills have emitted telemetry (1 never invoked)');
    expect(md).toContain('`alpha`');
  });

  it('notes when the window is shorter than the inactivity threshold', () => {
    const records = [makeRecord({ skill: 'alpha', startedAt: '2026-07-01T00:00:00.000Z' })];
    const report = getCatalogRetrospectiveReport(records, { now: NOW, inactiveDays: 90 });
    const md = renderRetrospectiveMarkdown(report);
    expect(md).toContain('shorter than the threshold');
  });
});
