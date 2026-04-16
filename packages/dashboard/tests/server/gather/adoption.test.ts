import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatherAdoption } from '../../../src/server/gather/adoption';

describe('gatherAdoption', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'adoption-gather-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('returns empty snapshot when adoption.jsonl does not exist', () => {
    const snapshot = gatherAdoption(projectPath);
    expect(snapshot.totalInvocations).toBe(0);
    expect(snapshot.uniqueSkills).toBe(0);
    expect(snapshot.topSkills).toEqual([]);
    expect(snapshot.period).toBe('all-time');
    expect(snapshot.generatedAt).toBeTypeOf('string');
  });

  it('returns aggregated snapshot from adoption.jsonl', () => {
    const metricsDir = join(projectPath, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const records = [
      {
        skill: 'harness-brainstorming',
        session: 's1',
        startedAt: '2026-04-15T12:00:00.000Z',
        duration: 5000,
        outcome: 'completed',
        phasesReached: ['explore', 'validate'],
      },
      {
        skill: 'harness-brainstorming',
        session: 's2',
        startedAt: '2026-04-16T12:00:00.000Z',
        duration: 7000,
        outcome: 'failed',
        phasesReached: ['explore'],
      },
      {
        skill: 'harness-planning',
        session: 's3',
        startedAt: '2026-04-16T13:00:00.000Z',
        duration: 10000,
        outcome: 'completed',
        phasesReached: ['plan'],
      },
    ];
    const contents = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(join(metricsDir, 'adoption.jsonl'), contents, 'utf-8');

    const snapshot = gatherAdoption(projectPath);
    expect(snapshot.totalInvocations).toBe(3);
    expect(snapshot.uniqueSkills).toBe(2);
    expect(snapshot.topSkills).toHaveLength(2);
    expect(snapshot.topSkills[0]!.skill).toBe('harness-brainstorming');
    expect(snapshot.topSkills[0]!.invocations).toBe(2);
    expect(snapshot.topSkills[0]!.successRate).toBe(0.5);
    expect(snapshot.topSkills[1]!.skill).toBe('harness-planning');
    expect(snapshot.topSkills[1]!.successRate).toBe(1);
  });

  it('caps top skills at 20', () => {
    const metricsDir = join(projectPath, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const records = Array.from({ length: 25 }, (_, i) => ({
      skill: `skill-${String(i).padStart(2, '0')}`,
      session: 's1',
      startedAt: '2026-04-15T12:00:00.000Z',
      duration: 1000,
      outcome: 'completed',
      phasesReached: [],
    }));
    const contents = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(join(metricsDir, 'adoption.jsonl'), contents, 'utf-8');

    const snapshot = gatherAdoption(projectPath);
    expect(snapshot.totalInvocations).toBe(25);
    expect(snapshot.uniqueSkills).toBe(25);
    expect(snapshot.topSkills).toHaveLength(20);
  });
});
