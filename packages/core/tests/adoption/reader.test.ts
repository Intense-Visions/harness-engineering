import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readAdoptionRecords } from '../../src/adoption/reader';

describe('readAdoptionRecords', () => {
  const tmpDir = path.join(__dirname, '__test-tmp__');
  const adoptionFile = path.join(tmpDir, '.harness', 'metrics', 'adoption.jsonl');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(adoptionFile), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses valid JSONL lines into SkillInvocationRecord array', () => {
    const record = {
      skill: 'harness-brainstorming',
      session: 'sess-1',
      startedAt: '2026-04-09T10:00:00.000Z',
      duration: 120000,
      outcome: 'completed',
      phasesReached: ['explore', 'evaluate'],
      tier: 1,
      trigger: 'manual',
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(record) + '\n');

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(record);
  });

  it('parses multiple lines', () => {
    const r1 = {
      skill: 'harness-brainstorming',
      session: 'sess-1',
      startedAt: '2026-04-09T10:00:00.000Z',
      duration: 120000,
      outcome: 'completed',
      phasesReached: ['explore'],
      tier: 1,
      trigger: 'manual',
    };
    const r2 = {
      skill: 'harness-planning',
      session: 'sess-2',
      startedAt: '2026-04-09T11:00:00.000Z',
      duration: 60000,
      outcome: 'failed',
      phasesReached: [],
      tier: 1,
      trigger: 'dispatch',
    };
    fs.writeFileSync(adoptionFile, JSON.stringify(r1) + '\n' + JSON.stringify(r2) + '\n');

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(2);
    expect(records[0]!.skill).toBe('harness-brainstorming');
    expect(records[1]!.skill).toBe('harness-planning');
  });

  it('returns empty array when file does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const records = readAdoptionRecords(tmpDir);
    expect(records).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    fs.writeFileSync(adoptionFile, '');
    const records = readAdoptionRecords(tmpDir);
    expect(records).toEqual([]);
  });

  it('skips malformed lines with warning and returns valid records', () => {
    const valid = {
      skill: 'harness-execution',
      session: 'sess-3',
      startedAt: '2026-04-09T12:00:00.000Z',
      duration: 30000,
      outcome: 'abandoned',
      phasesReached: ['scope'],
      tier: 2,
      trigger: 'on_new_feature',
    };
    fs.writeFileSync(adoptionFile, 'not json\n' + JSON.stringify(valid) + '\n{broken\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]!.skill).toBe('harness-execution');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed'));
    warnSpy.mockRestore();
  });

  it('skips blank lines without warning', () => {
    const valid = {
      skill: 'harness-brainstorming',
      session: 'sess-4',
      startedAt: '2026-04-09T13:00:00.000Z',
      duration: 50000,
      outcome: 'completed',
      phasesReached: ['explore', 'evaluate', 'prioritize'],
      tier: 1,
      trigger: 'manual',
    };
    fs.writeFileSync(adoptionFile, '\n' + JSON.stringify(valid) + '\n\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
