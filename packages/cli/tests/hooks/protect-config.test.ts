import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/protect-config.js');

function runHook(stdinData: string): { exitCode: number; stderr: string } {
  const stdinFile = join(mkdtempSync(join(tmpdir(), 'pc-')), 'stdin.json');
  writeFileSync(stdinFile, stdinData);
  const result = spawnSync('sh', ['-c', `cat "${stdinFile}" | node "${HOOK_PATH}"`], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  try {
    rmSync(stdinFile, { force: true });
  } catch {
    /* ignore */
  }
  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? '',
  };
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

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json');
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('');
    expect(exitCode).toBe(0);
  });

  it('fails open on missing file_path', () => {
    const input = JSON.stringify({
      tool_name: 'Write',
      tool_input: { content: '{}' },
    });
    const { exitCode } = runHook(input);
    expect(exitCode).toBe(0);
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
