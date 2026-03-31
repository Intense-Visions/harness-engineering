import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/pre-compact-state.js');

function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
  try {
    execFileSync('node', [HOOK_PATH], {
      input: stdinData,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd ?? process.cwd(),
    });
    return { exitCode: 0, stderr: '' };
  } catch (err: any) {
    return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
  }
}

function readSummary(tmpDir: string): any {
  const summaryPath = join(tmpDir, '.harness', 'state', 'pre-compact-summary.json');
  return JSON.parse(readFileSync(summaryPath, 'utf-8'));
}

describe('pre-compact-state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pre-compact-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/state/ directory and writes summary', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const summaryPath = join(tmpDir, '.harness', 'state', 'pre-compact-summary.json');
    expect(existsSync(summaryPath)).toBe(true);
  });

  it('summary contains all required fields', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary).toHaveProperty('timestamp');
    expect(summary).toHaveProperty('sessionId');
    expect(summary).toHaveProperty('activeStream');
    expect(summary).toHaveProperty('recentDecisions');
    expect(summary).toHaveProperty('openQuestions');
    expect(summary).toHaveProperty('currentPhase');
    expect(Array.isArray(summary.recentDecisions)).toBe(true);
    expect(Array.isArray(summary.openQuestions)).toBe(true);
  });

  it('reads decisions from .harness/state.json when present', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.harness', 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        decisions: [
          { decision: 'decision-1' },
          { decision: 'decision-2' },
          { decision: 'decision-3' },
        ],
        blockers: ['unresolved-question-1'],
        position: { phase: 'execute', task: 'Task 2' },
      })
    );

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary.recentDecisions).toEqual(['decision-1', 'decision-2', 'decision-3']);
    expect(summary.openQuestions).toEqual(['unresolved-question-1']);
    expect(summary.currentPhase).toBe('execute');
  });

  it('limits recentDecisions to last 5', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.harness', 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        decisions: [
          { decision: 'd1' },
          { decision: 'd2' },
          { decision: 'd3' },
          { decision: 'd4' },
          { decision: 'd5' },
          { decision: 'd6' },
          { decision: 'd7' },
        ],
        blockers: [],
      })
    );

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary.recentDecisions).toHaveLength(5);
    expect(summary.recentDecisions[0]).toBe('d3');
    expect(summary.recentDecisions[4]).toBe('d7');
  });

  it('works without .harness/state.json (defaults to empty)', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const summary = readSummary(tmpDir);
    expect(summary.recentDecisions).toEqual([]);
    expect(summary.openQuestions).toEqual([]);
    expect(summary.currentPhase).toBeNull();
  });

  it('preserves existing .harness directory', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', 'existing.txt'), 'keep me');

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    expect(existsSync(join(tmpDir, '.harness', 'existing.txt'))).toBe(true);
  });

  it('overwrites previous summary on each run', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);
    const summary1 = readSummary(tmpDir);

    runHook(input, tmpDir);
    const summary2 = readSummary(tmpDir);

    // Timestamps should differ (or at least file was overwritten)
    expect(summary2).toHaveProperty('timestamp');
    expect(summary2.timestamp).not.toBe(summary1.timestamp);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json', tmpDir);
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('', tmpDir);
    expect(exitCode).toBe(0);
  });

  it('always exits 0', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });
});
