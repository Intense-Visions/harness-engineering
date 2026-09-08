import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

/**
 * Coverage for the `cleanup` commander action + `printCleanupResult` — the
 * JSON / QUIET / TEXT output branches, the error-exit paths, the >10-item
 * truncation ("... and N more"), and the findings-json contract — none of
 * which the existing sibling test (pure `runCleanup` only) drives.
 */

const analyzeResultHolder = { current: null as unknown };

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    EntropyAnalyzer: class {
      constructor(_config: unknown) {}
      async analyze() {
        return analyzeResultHolder.current;
      }
    },
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', docsDir: './docs', entropy: { excludePatterns: [] } },
  }),
}));

import { createCleanupCommand } from '../../src/commands/cleanup';
import { resolveConfig } from '../../src/config/loader';
import { logger } from '../../src/output/logger';

function report(over: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    value: {
      drift: { drifts: [{ docFile: 'docs/a.md', line: 1, type: 't', issue: 'i', details: 'd' }] },
      deadCode: { deadFiles: [], deadExports: [] },
      patterns: { violations: [] },
      ...over,
    },
  };
}

describe('cleanup command action (cov544b)', () => {
  let logs: string[];
  let errs: string[];
  let exitCode: number | null;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveConfig).mockReturnValue({
      ok: true,
      value: { version: 1, rootDir: '.', docsDir: './docs', entropy: { excludePatterns: [] } },
    } as never);
    analyzeResultHolder.current = report();
    logs = [];
    errs = [];
    exitCode = null;
    spies = [
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      }),
      vi.spyOn(logger, 'error').mockImplementation((m: string) => errs.push(m)),
      vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never),
    ];
  });

  afterEach(() => spies.forEach((s) => s.mockRestore()));

  async function run(globals: string[], localAfter: string[] = []) {
    const program = new Command();
    program.option('--config <path>');
    program.option('--json');
    program.option('--quiet');
    program.option('--verbose');
    program.addCommand(createCleanupCommand());
    try {
      await program.parseAsync([...globals, 'cleanup', ...localAfter], { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('TEXT mode prints the drift section and exits 1 when issues exist', async () => {
    await run([]);
    expect(exitCode).toBe(1);
    const out = logs.join('\n');
    expect(out).toContain('Documentation drift');
    expect(out).toContain('docs/a.md');
  });

  it('exits 0 when there are zero issues', async () => {
    analyzeResultHolder.current = report({ drift: { drifts: [] } });
    await run([]);
    expect(exitCode).toBe(0);
  });

  it('JSON mode prints the serialized result value', async () => {
    await run(['--json']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.totalIssues).toBe(1);
    expect(Array.isArray(parsed.driftIssues)).toBe(true);
  });

  it('QUIET mode suppresses output when zero issues, exits 0', async () => {
    analyzeResultHolder.current = report({ drift: { drifts: [] } });
    await run(['--quiet']);
    expect(exitCode).toBe(0);
    expect(logs.length).toBe(0);
  });

  it('QUIET mode still prints the issue detail when issues exist', async () => {
    await run(['--quiet']);
    expect(exitCode).toBe(1);
    expect(logs.join('\n')).toContain('Documentation drift');
  });

  it('truncates dead-code and pattern lists past 10 items with a "... and N more" line', async () => {
    const deadExports = Array.from({ length: 13 }, (_, i) => ({
      file: `src/f${i}.ts`,
      name: `sym${i}`,
    }));
    const violations = Array.from({ length: 12 }, (_, i) => ({
      file: `src/p${i}.ts`,
      pattern: 'no-any',
      message: 'bad',
    }));
    analyzeResultHolder.current = report({
      drift: { drifts: [] },
      deadCode: { deadFiles: [], deadExports },
      patterns: { violations },
    });
    await run([]);
    expect(exitCode).toBe(1);
    const out = logs.join('\n');
    expect(out).toContain('Dead code');
    expect(out).toContain('... and 3 more');
    expect(out).toContain('Pattern violations');
    expect(out).toContain('... and 2 more');
  });

  it('emits the findings-json contract line when --findings-json is set', async () => {
    await run([], ['--findings-json']);
    const contract = logs.find((l) => l.includes('"findings"'));
    expect(contract).toBeDefined();
    expect(contract).toContain('cleanup');
  });

  it('error path (config failure) in TEXT mode logs via logger.error and exits with the error code', async () => {
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: false,
      error: { message: 'boom', exitCode: 2 },
    } as never);
    await run([]);
    expect(exitCode).toBe(2);
    expect(errs.join('\n')).toContain('boom');
  });

  it('error path in JSON mode prints a JSON {error} envelope', async () => {
    vi.mocked(resolveConfig).mockReturnValueOnce({
      ok: false,
      error: { message: 'boom-json', exitCode: 2 },
    } as never);
    await run(['--json']);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.error).toContain('boom-json');
  });
});
