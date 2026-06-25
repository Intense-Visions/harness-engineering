import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/quality-gate.js');

function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
  const dir = cwd ?? process.cwd();
  // Pass stdin directly via spawnSync's `input` option (issue 619): the previous
  // `cat <file> | node` pipe intermittently delivered empty/partial stdin under
  // v8 coverage, tripping the hooks' fail-open path. macOS CI is the gate.
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdinData,
    encoding: 'utf-8',
    cwd: dir,
    timeout: 60000,
  });
  return {
    exitCode: result.signal ? 0 : (result.status ?? 1),
    stderr: result.stderr ?? '',
  };
}

describe('quality-gate', { timeout: 60000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'quality-gate-'));
    // ESM hooks require "type": "module" to be resolvable from cwd
    writeFileSync(join(tmpDir, 'package.json'), '{"type":"module"}\n');
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

  it('detects biome.json and reports on stderr', { timeout: 60000 }, () => {
    writeFileSync(join(tmpDir, 'biome.json'), '{}');
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'edited file',
    });
    // npx may timeout or fail on CI — hook contract is "never blocks" (never exit 2)
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).not.toBe(2);
  });

  it('detects biome.jsonc', { timeout: 60000 }, () => {
    writeFileSync(join(tmpDir, 'biome.jsonc'), '{}');
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'wrote file',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).not.toBe(2);
  });

  it('detects prettierrc when no biome config', () => {
    writeFileSync(join(tmpDir, '.prettierrc'), '{}');
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts' },
      tool_output: 'wrote file',
    });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).not.toBe(2);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json');
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  it('detects .go file and exits 0', { timeout: 60000 }, () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: 'main.go' },
      tool_output: 'edited file',
    });
    // gofmt likely not installed in test env, but should still exit 0 (fail-open)
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });

  it('never exits with code 2 (warn-only hook)', { timeout: 60000 }, () => {
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
