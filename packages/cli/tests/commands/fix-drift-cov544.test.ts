import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    buildSnapshot: vi.fn().mockResolvedValue({ ok: true, value: { files: [], docs: [] } }),
    detectDocDrift: vi.fn().mockResolvedValue({ ok: true, value: { drifts: [] } }),
    detectDeadCode: vi.fn().mockResolvedValue({
      ok: true,
      value: { deadFiles: [], deadExports: [], unusedImports: [] },
    }),
    createFixes: vi.fn().mockReturnValue([]),
    applyFixes: vi
      .fn()
      .mockResolvedValue({ ok: true, value: { applied: [], skipped: [], errors: [] } }),
    generateSuggestions: vi.fn().mockReturnValue({ suggestions: [] }),
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', docsDir: './docs', entropy: { excludePatterns: [] } },
  }),
}));

import { createFixDriftCommand } from '../../src/commands/fix-drift';
import { createFixes, generateSuggestions } from '@harness-engineering/core';
import { resolveConfig } from '../../src/config/loader';

let logOutput: string[];
let exitCode: number | undefined;
const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--verbose').option('--quiet').option('--config <path>');
  parent.addCommand(createFixDriftCommand());
  parent.exitOverride();
  return parent.parseAsync(['fix-drift', ...args], { from: 'user' });
}

function manyFixes(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    file: `src/f${i}.ts`,
    action: 'remove-dead-file',
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('fix-drift command action (cov544)', () => {
  it('clean dry-run prints summary and exits 0', async () => {
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('Fix drift (dry-run)');
  });

  it('json mode stringifies the result and exits 0', async () => {
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.dryRun).toBe(true);
    expect(parsed.fixes).toEqual([]);
  });

  it('error path (json) prints {error} and exits with the error code', async () => {
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: false,
      error: { message: 'Config not found', exitCode: 2 },
    } as never);
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(JSON.parse(logOutput[0]).error).toBe('Config not found');
  });

  it('error path (text) logs via logger and exits with the error code', async () => {
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: false,
      error: { message: 'Config broken', exitCode: 2 },
    } as never);
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('quiet mode with no fixes/suggestions suppresses the summary', async () => {
    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).not.toContain('Fix drift');
  });

  it('dry-run with fixes prints fixes list, truncation and the "--no-dry-run" hint', async () => {
    vi.mocked(createFixes).mockReturnValueOnce(manyFixes(12) as never);
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Fixes:');
    expect(out).toContain('[pending]');
    expect(out).toContain('... and 2 more');
    expect(out).toContain('Run with --no-dry-run to apply fixes.');
  });

  it('suggestions render (and truncate) when there are no fixes', async () => {
    vi.mocked(generateSuggestions).mockReturnValueOnce({
      suggestions: Array.from({ length: 12 }, (_, i) => ({
        title: `sug ${i}`,
        files: [`f${i}.md`],
      })),
    } as never);
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Suggestions:');
    expect(out).toContain('sug 0');
    expect(out).toContain('... and 2 more');
  });

  it('verbose mode prints suggestions even alongside fixes', async () => {
    vi.mocked(createFixes).mockReturnValueOnce(manyFixes(1) as never);
    vi.mocked(generateSuggestions).mockReturnValueOnce({
      suggestions: [{ title: 'update docs', files: ['README.md'] }],
    } as never);
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Fixes:');
    expect(out).toContain('Suggestions:');
    expect(out).toContain('update docs');
  });
});
