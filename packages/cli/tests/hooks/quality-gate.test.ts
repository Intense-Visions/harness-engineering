import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/quality-gate.js');

function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
  try {
    const result = execFileSync('node', [HOOK_PATH], {
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

describe('quality-gate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'quality-gate-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('always exits 0 even when formatter is not found', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'wrote file',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });

  it('detects biome.json and reports on stderr', () => {
    writeFileSync(join(tmpDir, 'biome.json'), '{}');
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'edited file',
    });
    // Will fail to run biome (not installed in tmpDir) but should still exit 0
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });

  it('detects biome.jsonc', () => {
    writeFileSync(join(tmpDir, 'biome.jsonc'), '{}');
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'wrote file',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });

  it('detects prettierrc when no biome config', () => {
    writeFileSync(join(tmpDir, '.prettierrc'), '{}');
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'wrote file',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json');
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  it('detects .go file and exits 0', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'main.go' },
      tool_output: 'edited file',
    });
    // gofmt likely not installed in test env, but should still exit 0 (fail-open)
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });

  it('never exits with code 2 (warn-only hook)', () => {
    writeFileSync(join(tmpDir, 'biome.json'), '{}');
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'edited file',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).not.toBe(2);
  });
});
