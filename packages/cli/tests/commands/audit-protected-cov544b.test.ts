import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const mockGlobResult: string[] = [];
const mockFileContents: Record<string, string> = {};

vi.mock('glob', () => ({
  glob: vi.fn().mockImplementation(async () => mockGlobResult),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((filePath: string) => {
      const normalized = (filePath as string).replaceAll('\\', '/');
      for (const [key, content] of Object.entries(mockFileContents)) {
        if (normalized.endsWith(key)) return content;
      }
      throw new Error(`ENOENT: ${filePath}`);
    }),
    existsSync: actual.existsSync,
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', docsDir: './docs' },
  }),
}));

import { createAuditProtectedCommand } from '../../src/commands/audit-protected';
import { resolveConfig } from '../../src/config/loader';

let logOutput: string[];
let errOutput: string[];
let exitCode: number | undefined;

const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  errOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--quiet').option('--verbose').option('--config <path>');
  parent.addCommand(createAuditProtectedCommand());
  parent.exitOverride();
  return parent.parseAsync(['audit-protected', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveConfig).mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', docsDir: './docs' },
  } as never);
  mockGlobResult.length = 0;
  for (const k of Object.keys(mockFileContents)) delete mockFileContents[k];
  logOutput = [];
  errOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('audit-protected command action (cov544b)', () => {
  it('prints a multi-line region range and single-line region in text mode, exits SUCCESS', async () => {
    mockGlobResult.push('src/multi.ts', 'src/single.ts');
    mockFileContents['src/multi.ts'] = [
      '// harness-ignore-start entropy: block reason',
      'export function a() {}',
      '// harness-ignore-end',
    ].join('\n');
    mockFileContents['src/single.ts'] = [
      '// harness-ignore entropy: one liner',
      'const x = 1;',
    ].join('\n');

    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    const out = logOutput.join('\n');
    expect(out).toContain('protected region');
    // range region (start != end) renders "start-end"; single renders just the line
    expect(out).toContain('src/multi.ts:1-3');
    expect(out).toContain('src/single.ts:2');
    expect(out).toContain('[entropy]');
    expect(out).toContain('block reason');
  });

  it('reports issues and exits VALIDATION_FAILED when annotations are malformed', async () => {
    mockGlobResult.push('src/bad.ts');
    mockFileContents['src/bad.ts'] = [
      '// harness-ignore-start entropy: never closed',
      'function orphan() {}',
    ].join('\n');

    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
    expect(logOutput.join('\n')).toContain('Issues');
  });

  it('emits JSON with the full result payload in --json mode', async () => {
    mockGlobResult.push('src/x.ts');
    mockFileContents['src/x.ts'] = [
      '// harness-ignore-start architecture: reason',
      'import y from "y";',
      '// harness-ignore-end',
    ].join('\n');

    await expect(run(['--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.regions).toHaveLength(1);
    expect(parsed.fileCount).toBe(1);
  });

  it('quiet mode suppresses the report when there are no regions', async () => {
    mockGlobResult.push('src/clean.ts');
    mockFileContents['src/clean.ts'] = 'const a = 1;\n';

    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    // printAuditResult is skipped (no regions in quiet mode) → no summary line
    expect(logOutput.join('\n')).not.toContain('Protected regions');
  });

  it('quiet mode still prints when regions exist', async () => {
    mockGlobResult.push('src/q.ts');
    mockFileContents['src/q.ts'] = ['// harness-ignore entropy: keep', 'const k = 1;'].join('\n');

    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    // In quiet mode the summary header is suppressed but the region list still prints.
    expect(logOutput.join('\n')).toContain('src/q.ts:2 [entropy] keep');
  });

  it('config failure in text mode logs the error and exits with the config exit code', async () => {
    vi.mocked(resolveConfig).mockReturnValue({
      ok: false,
      error: { message: 'Config not found', exitCode: 2 },
    } as never);

    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain('Config not found');
  });

  it('config failure in --json mode emits an error object', async () => {
    vi.mocked(resolveConfig).mockReturnValue({
      ok: false,
      error: { message: 'bad config', exitCode: 2 },
    } as never);

    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput.join('\n'))).toEqual({ error: 'bad config' });
  });
});
