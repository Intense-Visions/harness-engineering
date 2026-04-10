import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/adoption-tracker.js');

function runHook(stdinData: string, cwd: string): { exitCode: number; stderr: string } {
  const stdinFile = join(cwd, '.stdin-data.json');
  writeFileSync(stdinFile, stdinData);
  const result = spawnSync('sh', ['-c', `cat "${stdinFile}" | node "${HOOK_PATH}"`], {
    encoding: 'utf-8',
    cwd,
    timeout: 15000,
  });
  try {
    rmSync(stdinFile, { force: true });
  } catch {
    /* ignore */
  }
  return {
    exitCode: result.status ?? (result.signal ? 0 : 1),
    stderr: result.stderr ?? '',
  };
}

function writeEventsJsonl(cwd: string, events: object[]): void {
  const harnessDir = join(cwd, '.harness');
  mkdirSync(harnessDir, { recursive: true });
  const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(harnessDir, 'events.jsonl'), content);
}

function readAdoptionRecords(cwd: string): object[] {
  const filePath = join(cwd, '.harness', 'metrics', 'adoption.jsonl');
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
  return lines.filter((l) => l.trim()).map((l) => JSON.parse(l));
}

const SAMPLE_EVENTS = [
  {
    timestamp: '2026-04-09T10:00:00.000Z',
    skill: 'harness-brainstorming',
    type: 'phase_transition',
    summary: 'Starting EXPLORE',
    data: { from: 'init', to: 'EXPLORE' },
  },
  {
    timestamp: '2026-04-09T10:05:00.000Z',
    skill: 'harness-brainstorming',
    type: 'phase_transition',
    summary: 'Moving to EVALUATE',
    data: { from: 'EXPLORE', to: 'EVALUATE' },
  },
  {
    timestamp: '2026-04-09T10:10:00.000Z',
    skill: 'harness-brainstorming',
    type: 'phase_transition',
    summary: 'Moving to VALIDATE',
    data: { from: 'EVALUATE', to: 'VALIDATE' },
  },
  {
    timestamp: '2026-04-09T10:15:00.000Z',
    skill: 'harness-brainstorming',
    type: 'handoff',
    summary: 'Handing off to planning',
    data: { fromSkill: 'harness-brainstorming', toSkill: 'harness-planning' },
  },
];

describe('adoption-tracker', { timeout: 30000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'adoption-tracker-'));
    writeFileSync(join(tmpDir, 'package.json'), '{"type":"module"}\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates adoption.jsonl with one record per skill', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const input = JSON.stringify({ session_id: 'session-001' });
    const result = runHook(input, tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    const record = records[0] as Record<string, unknown>;
    expect(record).toHaveProperty('skill', 'harness-brainstorming');
    expect(record).toHaveProperty('session', 'session-001');
    expect(record).toHaveProperty('outcome', 'completed');
    expect(record).toHaveProperty('phasesReached');
    expect((record.phasesReached as string[]).sort()).toEqual(
      ['EVALUATE', 'EXPLORE', 'VALIDATE'].sort()
    );
  });

  it('derives outcome=completed when handoff is present', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect((records[0] as Record<string, unknown>).outcome).toBe('completed');
  });

  it('derives outcome=failed when error is present', () => {
    const events = [
      {
        timestamp: '2026-04-09T10:00:00.000Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Starting PREPARE',
        data: { from: 'init', to: 'PREPARE' },
      },
      {
        timestamp: '2026-04-09T10:05:00.000Z',
        skill: 'harness-execution',
        type: 'error',
        summary: 'Test failures exceeded threshold',
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect((records[0] as Record<string, unknown>).outcome).toBe('failed');
  });

  it('derives outcome=abandoned when no handoff, no final phase, no error', () => {
    const events = [
      {
        timestamp: '2026-04-09T10:00:00.000Z',
        skill: 'harness-planning',
        type: 'phase_transition',
        summary: 'Starting SCOPE',
        data: { from: 'init', to: 'SCOPE' },
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect((records[0] as Record<string, unknown>).outcome).toBe('abandoned');
  });

  it('derives duration from first to last event', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    const record = records[0] as Record<string, unknown>;
    // 10:00 to 10:15 = 15 minutes = 900000ms
    expect(record.duration).toBe(900000);
  });

  it('handles multiple skills in one session', () => {
    const events = [
      ...SAMPLE_EVENTS,
      {
        timestamp: '2026-04-09T11:00:00.000Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Starting PREPARE',
        data: { from: 'init', to: 'PREPARE' },
      },
      {
        timestamp: '2026-04-09T11:30:00.000Z',
        skill: 'harness-execution',
        type: 'error',
        summary: 'Build failed',
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);

    const records = readAdoptionRecords(tmpDir);
    expect(records).toHaveLength(2);
    const skills = (records as Array<Record<string, unknown>>).map((r) => r.skill);
    expect(skills).toContain('harness-brainstorming');
    expect(skills).toContain('harness-execution');
  });

  it('exits 0 when events.jsonl is missing', () => {
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('exits 0 when events.jsonl is empty', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', 'events.jsonl'), '');
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('exits 0 when events.jsonl contains only malformed lines', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', 'events.jsonl'), 'not json\nalso bad\n');
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('skips when adoption.enabled is false', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    writeFileSync(
      join(tmpDir, 'harness.config.json'),
      JSON.stringify({ adoption: { enabled: false } })
    );
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });

  it('runs when adoption.enabled is true', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    writeFileSync(
      join(tmpDir, 'harness.config.json'),
      JSON.stringify({ adoption: { enabled: true } })
    );
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(1);
  });

  it('runs when harness.config.json is missing (default: enabled)', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(1);
  });

  it('exits 0 on empty stdin', () => {
    const result = runHook('', tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 on malformed stdin', () => {
    const result = runHook('not json', tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('appends to existing adoption.jsonl', () => {
    writeEventsJsonl(tmpDir, SAMPLE_EVENTS);
    runHook(JSON.stringify({ session_id: 'session-001' }), tmpDir);
    // Second run (re-write events to simulate new session)
    writeEventsJsonl(tmpDir, [
      {
        timestamp: '2026-04-09T12:00:00.000Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Starting',
        data: { from: 'init', to: 'EXECUTE' },
      },
    ]);
    runHook(JSON.stringify({ session_id: 'session-002' }), tmpDir);

    const records = readAdoptionRecords(tmpDir) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    expect(records[0].session).toBe('session-001');
    expect(records[1].session).toBe('session-002');
  });

  it('ignores irrelevant event types (decision, checkpoint)', () => {
    const events = [
      {
        timestamp: '2026-04-09T10:00:00.000Z',
        skill: 'harness-planning',
        type: 'decision',
        summary: 'Chose option A',
      },
      {
        timestamp: '2026-04-09T10:05:00.000Z',
        skill: 'harness-planning',
        type: 'checkpoint',
        summary: 'Human verify',
      },
    ];
    writeEventsJsonl(tmpDir, events);
    const result = runHook(JSON.stringify({ session_id: 'test' }), tmpDir);
    expect(result.exitCode).toBe(0);
    expect(readAdoptionRecords(tmpDir)).toHaveLength(0);
  });
});
