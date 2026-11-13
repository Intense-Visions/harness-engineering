import { describe, it, expect } from 'vitest';
import {
  AUTONOMY_LEVELS,
  AUTONOMY_SOURCES,
  DEFAULT_AUTONOMY_AUDIT,
  AUTO_DECISION_PAUSE_CLASSES,
  AUTO_DECISION_AUDIT_STATUSES,
} from '../src/index';
import type {
  ResolvedAutonomy,
  AutonomySessionOverride,
  AutoDecision,
  AutoDecisionSummary,
} from '../src/index';

describe('autonomy contract', () => {
  it('defines exactly two levels', () => {
    expect(AUTONOMY_LEVELS).toEqual(['supervised', 'trusted']);
  });
  it('lists sources in precedence order (highest first)', () => {
    expect(AUTONOMY_SOURCES).toEqual(['flag', 'session', 'env', 'user-config', 'default']);
  });
  it('defaults audit on for trusted and off for supervised (D9)', () => {
    expect(DEFAULT_AUTONOMY_AUDIT).toEqual({ trusted: true, supervised: false });
  });
  it('ResolvedAutonomy and per-field override shapes compile', () => {
    const r: ResolvedAutonomy = {
      level: 'supervised',
      audit: false,
      source: { level: 'default', audit: 'default' },
      warnings: [],
    };
    const o: AutonomySessionOverride = {
      level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
    };
    expect(r.source.level).toBe('default');
    expect(o.level?.origin).toBe('cli');
  });
});

describe('auto-decision contract (D6)', () => {
  it('logs only ceremony and judgment pauses; irreversible and gate never auto-proceed (D1)', () => {
    expect(AUTO_DECISION_PAUSE_CLASSES).toEqual(['ceremony', 'judgment']);
  });
  it('defines the four audit statuses (D7, D8, D11)', () => {
    expect(AUTO_DECISION_AUDIT_STATUSES).toEqual(['agreed', 'escalated', 'unavailable', 'off']);
  });
  it('entry and summary shapes compile', () => {
    const d: AutoDecision = {
      ts: '2026-11-13T00:00:00.000Z',
      skill: 'harness-planning',
      phase: 'DECOMPOSE',
      pauseClass: 'judgment',
      question: 'Which approach?',
      options: ['A', 'B'],
      chosen: 'A',
      rationale: 'smaller blast radius',
      autonomySource: 'user-config',
      audit: { status: 'agreed', blindPick: 'A' },
    };
    const s: AutoDecisionSummary = {
      total: 1,
      byClass: { ceremony: 0, judgment: 1 },
      judgments: 1,
      audited: 1,
      agreed: 1,
      escalations: 0,
      unavailable: 0,
      off: 0,
      agreementRate: 1,
    };
    expect(d.audit?.status).toBe('agreed');
    expect(s.agreementRate).toBe(1);
  });
});
