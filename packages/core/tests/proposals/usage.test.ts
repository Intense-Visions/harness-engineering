import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { deriveSkillUsage } from '../../src/proposals/usage';

const tmpDir = path.join(__dirname, '__usage_tmp__');

function writeRecord(rec: Record<string, unknown>) {
  const file = path.join(tmpDir, '.harness', 'metrics', 'adoption.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');
}

describe('deriveSkillUsage', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero when no adoption file exists', () => {
    const stats = deriveSkillUsage(tmpDir, 'some-skill');
    expect(stats.count).toBe(0);
    expect(stats.lastUsed).toBeUndefined();
  });

  it('counts only matching skill within the window', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1000).toISOString();
    const old = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    writeRecord({
      skill: 'auto-rename-helpers',
      session: 's1',
      startedAt: recent,
      duration: 1,
      outcome: 'completed',
      phasesReached: ['p1'],
    });
    writeRecord({
      skill: 'auto-rename-helpers',
      session: 's2',
      startedAt: old,
      duration: 1,
      outcome: 'completed',
      phasesReached: ['p1'],
    });
    writeRecord({
      skill: 'other',
      session: 's3',
      startedAt: recent,
      duration: 1,
      outcome: 'completed',
      phasesReached: ['p1'],
    });

    const stats = deriveSkillUsage(tmpDir, 'auto-rename-helpers', 30);
    expect(stats.count).toBe(1);
    expect(stats.lastUsed).toBe(recent);
    expect(stats.windowDays).toBe(30);
  });
});
