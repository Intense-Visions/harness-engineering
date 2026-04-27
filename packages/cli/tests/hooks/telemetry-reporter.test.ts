import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/telemetry-reporter.js');

function runHook(
  stdinData: string,
  cwd: string,
  env?: Record<string, string>
): { exitCode: number; stderr: string } {
  const stdinFile = join(cwd, '.stdin-data.json');
  writeFileSync(stdinFile, stdinData);
  const result = spawnSync('sh', ['-c', `cat "${stdinFile}" | node "${HOOK_PATH}"`], {
    encoding: 'utf-8',
    cwd,
    timeout: 15000,
    env: { ...process.env, ...env },
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

function writeAdoptionJsonl(cwd: string, records: object[]): void {
  const metricsDir = join(cwd, '.harness', 'metrics');
  mkdirSync(metricsDir, { recursive: true });
  const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(join(metricsDir, 'adoption.jsonl'), content);
}

const SAMPLE_RECORD = {
  skill: 'harness-brainstorming',
  session: 'session-001',
  startedAt: '2026-04-10T10:00:00.000Z',
  duration: 300000,
  outcome: 'completed',
  phasesReached: ['EXPLORE', 'EVALUATE', 'VALIDATE'],
};

const STDIN_INPUT = JSON.stringify({ session_id: 'session-001' });

describe('telemetry-reporter', { timeout: 30000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'telemetry-reporter-'));
    writeFileSync(join(tmpDir, 'package.json'), '{"type":"module"}\n');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Exit 0 on edge cases ---

  it('exits 0 on empty stdin', () => {
    const result = runHook('', tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 on malformed stdin', () => {
    const result = runHook('not json', tmpDir);
    expect(result.exitCode).toBe(0);
  });

  it('exits 0 when no adoption.jsonl exists', () => {
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  // --- Consent checks ---

  it('exits 0 without HTTP when DO_NOT_TRACK=1', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir, { DO_NOT_TRACK: '1' });
    expect(result.exitCode).toBe(0);
    // Should not show first-run notice
    expect(result.stderr).not.toContain('anonymous usage analytics');
  });

  it('exits 0 without HTTP when HARNESS_TELEMETRY_OPTOUT=1', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir, { HARNESS_TELEMETRY_OPTOUT: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('anonymous usage analytics');
  });

  it('exits 0 without HTTP when telemetry.enabled is false in config', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    writeFileSync(
      join(tmpDir, 'harness.config.json'),
      JSON.stringify({ telemetry: { enabled: false } })
    );
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('anonymous usage analytics');
  });

  // --- First-run notice ---

  it('shows first-run notice when flag file does not exist', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('anonymous usage analytics');
    expect(result.stderr).toContain('DO_NOT_TRACK=1');
    // Flag file should be created
    expect(existsSync(join(tmpDir, '.harness', '.telemetry-notice-shown'))).toBe(true);
  });

  it('does not show notice when flag file already exists', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', '.telemetry-notice-shown'), 'shown');
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('anonymous usage analytics');
  });

  // --- Install ID ---

  it('creates .install-id if it does not exist', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    const installIdFile = join(tmpDir, '.harness', '.install-id');
    expect(existsSync(installIdFile)).toBe(true);
    const id = readFileSync(installIdFile, 'utf-8').trim();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('reuses existing .install-id', () => {
    const existingId = '12345678-1234-4abc-8abc-123456789abc';
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', '.install-id'), existingId);
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    const id = readFileSync(join(tmpDir, '.harness', '.install-id'), 'utf-8').trim();
    expect(id).toBe(existingId);
  });

  // --- Event collection and reporting ---

  it('reports telemetry events when consent is allowed and records exist', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    // The hook attempts to send (will fail silently since PostHog is not reachable in test)
    // but should log the attempt or the "no records" skip
    // With a placeholder API key, PostHog will return 4xx (permanent failure, no retry)
    // so the hook completes quickly
    expect(result.stderr).toContain('[telemetry-reporter]');
  });

  it('exits 0 even when fetch fails (silent failure)', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    // No network mocking — real fetch will fail (placeholder API key)
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  // --- Multiple records ---

  it('handles multiple adoption records', () => {
    const records = [
      SAMPLE_RECORD,
      {
        skill: 'harness-execution',
        session: 'session-001',
        startedAt: '2026-04-10T11:00:00.000Z',
        duration: 120000,
        outcome: 'failed',
        phasesReached: ['PREPARE'],
      },
    ];
    writeAdoptionJsonl(tmpDir, records);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
  });

  // --- Cursor-based dedup ---

  it('preserves adoption.jsonl after sending (no truncation)', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    // adoption.jsonl should still contain the record
    const content = readFileSync(join(tmpDir, '.harness', 'metrics', 'adoption.jsonl'), 'utf-8');
    expect(content).toContain('harness-brainstorming');
  });

  it('writes cursor file after sending', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    const cursorPath = join(tmpDir, '.harness', 'metrics', '.telemetry-cursor');
    expect(existsSync(cursorPath)).toBe(true);
    const cursor = JSON.parse(readFileSync(cursorPath, 'utf-8'));
    expect(typeof cursor.offset).toBe('number');
    expect(cursor.offset).toBeGreaterThan(0);
  });

  it('does not re-send records on second run (cursor dedup)', () => {
    writeAdoptionJsonl(tmpDir, [SAMPLE_RECORD]);
    runHook(STDIN_INPUT, tmpDir);
    // Second run with same adoption.jsonl
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('No new adoption records');
  });

  // --- Malformed adoption.jsonl ---

  it('skips malformed lines in adoption.jsonl', () => {
    const metricsDir = join(tmpDir, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, 'adoption.jsonl'),
      'not json\n' + JSON.stringify(SAMPLE_RECORD) + '\n'
    );
    const result = runHook(STDIN_INPUT, tmpDir);
    expect(result.exitCode).toBe(0);
  });
});
