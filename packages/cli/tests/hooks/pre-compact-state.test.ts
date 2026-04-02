import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/pre-compact-state.js');

function runHook(
  stdinData: string,
  cwd?: string
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdinData,
    encoding: 'utf-8',
    cwd: cwd ?? process.cwd(),
    timeout: 15000,
  });
  return {
    exitCode: result.status ?? (result.signal ? 0 : 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readSummary(tmpDir: string): any {
  const summaryPath = join(tmpDir, '.harness', 'state', 'pre-compact-summary.json');
  expect(existsSync(summaryPath), 'Summary file not created — hook may have failed silently').toBe(
    true
  );
  return JSON.parse(readFileSync(summaryPath, 'utf-8'));
}

describe('pre-compact-state', { timeout: 30000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pre-compact-'));
    // ESM hooks require "type": "module" to be resolvable from cwd
    writeFileSync(join(tmpDir, 'package.json'), '{"type":"module"}\n');
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
    const result = runHook(input, tmpDir);
    // If the hook didn't write the file, surface its stderr for diagnosis
    if (!existsSync(join(tmpDir, '.harness', 'state', 'pre-compact-summary.json'))) {
      expect.fail(`Hook did not write summary (exit=${result.exitCode}, stderr=${result.stderr})`);
    }
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

    runHook(input, tmpDir);
    const summary2 = readSummary(tmpDir);

    // Verify the file is valid JSON after the second write (overwrite worked)
    expect(summary2).toHaveProperty('timestamp');
    expect(typeof summary2.timestamp).toBe('string');
    expect(summary2.recentDecisions).toEqual([]);
  });

  it('discovers active session and populates sessionId and currentPhase', () => {
    const sessionDir = join(tmpDir, '.harness', 'sessions', 'my-session');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, 'autopilot-state.json'),
      JSON.stringify({
        schemaVersion: 4,
        currentState: 'EXECUTE',
        currentPhase: 1,
        phases: [
          { name: 'Phase 1', status: 'complete' },
          { name: 'Phase 2', status: 'pending' },
        ],
      })
    );

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary.sessionId).toBe('my-session');
    expect(summary.activeStream).toBe('EXECUTE');
    expect(summary.currentPhase).toBe('EXECUTE');
  });

  it('selects the most recently modified session when multiple exist', () => {
    const session1Dir = join(tmpDir, '.harness', 'sessions', 'older-session');
    const session2Dir = join(tmpDir, '.harness', 'sessions', 'newer-session');
    mkdirSync(session1Dir, { recursive: true });
    mkdirSync(session2Dir, { recursive: true });

    // Write older session first
    writeFileSync(
      join(session1Dir, 'autopilot-state.json'),
      JSON.stringify({ schemaVersion: 4, currentState: 'DONE' })
    );

    // Small delay to ensure different mtime
    const start = Date.now();
    while (Date.now() - start < 50) {
      /* busy wait */
    }

    // Write newer session
    writeFileSync(
      join(session2Dir, 'autopilot-state.json'),
      JSON.stringify({ schemaVersion: 4, currentState: 'VERIFY' })
    );

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary.sessionId).toBe('newer-session');
    expect(summary.activeStream).toBe('VERIFY');
  });

  it('falls back gracefully when sessions directory does not exist', () => {
    // No .harness/sessions/ directory at all
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const summary = readSummary(tmpDir);
    expect(summary.sessionId).toBeNull();
    expect(summary.activeStream).toBeNull();
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
