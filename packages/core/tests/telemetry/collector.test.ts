import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectEvents } from '../../src/telemetry/collector';
import type { ConsentState } from '@harness-engineering/types';

describe('collectEvents', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-collector__');
  const metricsDir = path.join(tmpDir, '.harness', 'metrics');
  const adoptionFile = path.join(metricsDir, 'adoption.jsonl');

  const allowedConsent: ConsentState = {
    allowed: true,
    installId: 'test-uuid-1234',
    identity: {},
  };

  beforeEach(() => {
    fs.mkdirSync(metricsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('converts adoption records to TelemetryEvent array', () => {
    const record = {
      skill: 'harness-brainstorming',
      session: 'sess-1',
      startedAt: '2026-04-10T10:00:00.000Z',
      duration: 5000,
      outcome: 'completed',
      phasesReached: ['SCOPE', 'DECOMPOSE'],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, allowedConsent);

    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('skill_invocation');
    expect(events[0]!.distinct_id).toBe('test-uuid-1234');
    expect(events[0]!.timestamp).toBe('2026-04-10T10:00:00.000Z');
    expect(events[0]!.properties.skillName).toBe('harness-brainstorming');
    expect(events[0]!.properties.duration).toBe(5000);
    expect(events[0]!.properties.outcome).toBe('success');
    expect(events[0]!.properties.phasesReached).toEqual(['SCOPE', 'DECOMPOSE']);
    expect(events[0]!.properties.installId).toBe('test-uuid-1234');
    expect(events[0]!.properties.os).toBe(process.platform);
    expect(events[0]!.properties.nodeVersion).toBe(process.version);
    expect(typeof events[0]!.properties.harnessVersion).toBe('string');
  });

  it('uses alias as distinct_id when identity has alias', () => {
    const consent: ConsentState = {
      allowed: true,
      installId: 'test-uuid-1234',
      identity: { alias: 'cwarner', project: 'myapp', team: 'platform' },
    };
    const record = {
      skill: 'harness-tdd',
      session: 'sess-2',
      startedAt: '2026-04-10T11:00:00.000Z',
      duration: 3000,
      outcome: 'completed',
      phasesReached: ['RED'],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, consent);

    expect(events[0]!.distinct_id).toBe('cwarner');
    expect(events[0]!.properties.project).toBe('myapp');
    expect(events[0]!.properties.team).toBe('platform');
  });

  it('includes project and team in properties when present', () => {
    const consent: ConsentState = {
      allowed: true,
      installId: 'test-uuid-1234',
      identity: { project: 'myapp', team: 'platform' },
    };
    const record = {
      skill: 'harness-execution',
      session: 'sess-3',
      startedAt: '2026-04-10T12:00:00.000Z',
      duration: 2000,
      outcome: 'failed',
      phasesReached: [],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, consent);

    expect(events[0]!.distinct_id).toBe('test-uuid-1234');
    expect(events[0]!.properties.project).toBe('myapp');
    expect(events[0]!.properties.team).toBe('platform');
  });

  it('returns empty array when adoption.jsonl does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toEqual([]);
  });

  it('returns empty array when adoption.jsonl is empty', () => {
    fs.writeFileSync(adoptionFile, '');
    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toEqual([]);
  });

  it('skips malformed lines and converts valid ones', () => {
    const good = {
      skill: 'harness-planning',
      session: 'sess-4',
      startedAt: '2026-04-10T13:00:00.000Z',
      duration: 1000,
      outcome: 'completed',
      phasesReached: ['SCOPE'],
    };
    fs.writeFileSync(adoptionFile, 'not json\n' + JSON.stringify(good) + '\n');

    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toHaveLength(1);
    expect(events[0]!.properties.skillName).toBe('harness-planning');
  });

  it('handles multiple records', () => {
    const records = [
      {
        skill: 'skill-a',
        session: 's1',
        startedAt: '2026-04-10T10:00:00Z',
        duration: 100,
        outcome: 'completed',
        phasesReached: [],
      },
      {
        skill: 'skill-b',
        session: 's2',
        startedAt: '2026-04-10T11:00:00Z',
        duration: 200,
        outcome: 'failed',
        phasesReached: ['A'],
      },
    ];
    fs.writeFileSync(adoptionFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const events = collectEvents(tmpDir, allowedConsent);
    expect(events).toHaveLength(2);
    expect(events[0]!.properties.skillName).toBe('skill-a');
    expect(events[1]!.properties.skillName).toBe('skill-b');
  });

  it('maps SkillInvocationRecord outcome to TelemetryEvent outcome', () => {
    const record = {
      skill: 'harness-tdd',
      session: 'sess-5',
      startedAt: '2026-04-10T14:00:00.000Z',
      duration: 4000,
      outcome: 'abandoned',
      phasesReached: [],
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const events = collectEvents(tmpDir, allowedConsent);
    // 'abandoned' is not in TelemetryEvent outcome union, should map to 'failure'
    expect(events[0]!.properties.outcome).toBe('failure');
  });
});
