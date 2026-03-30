import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/cost-tracker.js');

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

describe('cost-tracker', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cost-tracker-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/metrics/costs.jsonl and appends entry', () => {
    const input = JSON.stringify({
      session_id: 'session-001',
      token_usage: { input_tokens: 1000, output_tokens: 500 },
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const costsFile = join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
    expect(existsSync(costsFile)).toBe(true);

    const line = readFileSync(costsFile, 'utf-8').trim();
    const entry = JSON.parse(line);
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('session_id', 'session-001');
    expect(entry).toHaveProperty('token_usage');
  });

  it('appends to existing costs.jsonl', () => {
    const input1 = JSON.stringify({
      session_id: 'session-001',
      token_usage: { input_tokens: 100, output_tokens: 50 },
    });
    const input2 = JSON.stringify({
      session_id: 'session-002',
      token_usage: { input_tokens: 200, output_tokens: 100 },
    });

    runHook(input1, tmpDir);
    runHook(input2, tmpDir);

    const costsFile = join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
    const lines = readFileSync(costsFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    expect(entry1.session_id).toBe('session-001');
    expect(entry2.session_id).toBe('session-002');
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
    const input = JSON.stringify({ session_id: 'test' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });
});
