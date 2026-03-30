import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/protect-config.js');

function runHook(stdinData: string): { exitCode: number; stderr: string } {
  try {
    execFileSync('node', [HOOK_PATH], {
      input: stdinData,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stderr: '' };
  } catch (err: any) {
    return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
  }
}

describe('protect-config', () => {
  const protectedFiles = [
    '.eslintrc.json',
    '.eslintrc.js',
    'eslint.config.mjs',
    '.prettierrc',
    '.prettierrc.json',
    'prettier.config.js',
    'biome.json',
    'biome.jsonc',
    '.ruff.toml',
    'ruff.toml',
    '.stylelintrc.json',
    '.markdownlint.json',
    'deno.json',
  ];

  for (const file of protectedFiles) {
    it(`blocks write to ${file}`, () => {
      const input = JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: file, content: '{}' },
      });
      const { exitCode, stderr } = runHook(input);
      expect(exitCode).toBe(2);
      expect(stderr).toContain('protected');
    });
  }

  it('blocks Edit to protected config', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '.eslintrc.json', old_string: 'a', new_string: 'b' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  it('allows write to normal source file', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'src/app.ts', content: 'code' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('allows write to tsconfig.json (not protected)', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'tsconfig.json', content: '{}' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('allows write to pyproject.toml (not protected)', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'pyproject.toml', content: '' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
  });

  it('blocks on malformed JSON (security hook)', () => {
    const { exitCode, stderr } = runHook('not json');
    expect(exitCode).toBe(2);
    expect(stderr).toContain('parse');
  });

  it('blocks on empty stdin (security hook)', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(2);
  });

  it('blocks on missing file_path (security hook)', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { content: '{}' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });

  it('handles nested paths correctly', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'config/.eslintrc.json', content: '{}' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(2);
  });
});
