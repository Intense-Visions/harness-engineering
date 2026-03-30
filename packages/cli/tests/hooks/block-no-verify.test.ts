import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/block-no-verify.js');

function runHook(stdinData: string): { exitCode: number; stderr: string } {
  try {
    const result = execFileSync('node', [HOOK_PATH], {
      input: stdinData,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stderr: '' };
  } catch (err: any) {
    return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
  }
}

describe('block-no-verify', () => {
  it('blocks git commit --no-verify', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit --no-verify -m "test"' },
    });
    const { exitCode, stderr } = runHook(input);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--no-verify');
  });

  it('blocks git push --no-verify', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git push --no-verify' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  it('allows normal git commit', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "normal commit"' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('allows non-git commands', () => {
    const input = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json at all');
    expect(exitCode).toBe(0);
  });

  it('fails open on missing tool_input', () => {
    const input = JSON.stringify({ tool_name: 'Bash' });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });
});
