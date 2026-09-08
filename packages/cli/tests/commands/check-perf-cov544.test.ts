import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const mockAnalyze = vi.fn();

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  class MockEntropyAnalyzer {
    analyze = mockAnalyze;
    constructor(_opts: unknown) {}
  }
  return { ...actual, EntropyAnalyzer: MockEntropyAnalyzer };
});

const resolveConfig = vi.fn();
vi.mock('../../src/config/loader', () => ({
  resolveConfig: (...a: unknown[]) => resolveConfig(...a),
}));

import { createCheckPerfCommand, runCheckPerf } from '../../src/commands/check-perf';

let logOutput: string[];
let exitCode: number | undefined;
const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--verbose').option('--quiet');
  parent.addCommand(createCheckPerfCommand());
  parent.exitOverride();
  return parent.parseAsync(['check-perf', ...args], { from: 'user' });
}

const CLEAN = {
  ok: true as const,
  value: {
    complexity: { violations: [], stats: { filesAnalyzed: 3 } },
    coupling: { violations: [] },
    sizeBudget: { violations: [] },
  },
};

const WITH_ERROR = {
  ok: true as const,
  value: {
    complexity: {
      violations: [
        {
          tier: 1,
          severity: 'error',
          metric: 'cc',
          file: 'a.ts',
          function: 'f',
          value: 20,
          threshold: 10,
          message: 'too complex',
        },
      ],
      stats: { filesAnalyzed: 1 },
    },
    coupling: { violations: [] },
    sizeBudget: { violations: [] },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveConfig.mockReturnValue({ ok: false, error: new Error('none') });
  logOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('check-perf action (cov544)', () => {
  it('clean run exits SUCCESS (0)', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('violations exit VALIDATION_FAILED (1) and print the message', async () => {
    mockAnalyze.mockResolvedValue(WITH_ERROR);
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
    expect(logOutput.join('\n')).toContain('too complex');
  });

  it('json mode emits structured validation output', async () => {
    mockAnalyze.mockResolvedValue(WITH_ERROR);
    await expect(run(['--json'])).rejects.toThrow('exit:1');
    expect(logOutput.join('\n')).toContain('too complex');
  });

  it('quiet mode still exits with the right code', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('verbose mode exits 0 on a clean run', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('preAction hook rejects an invalid --severity with ERROR (2)', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run(['--severity', 'bogus'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('preAction hook accepts a valid --severity', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run(['--severity', 'warning'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('--structural narrows the analysis and exits 0 when clean', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run(['--structural'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('--coupling and --size flags are forwarded through the option spreads', async () => {
    mockAnalyze.mockResolvedValue(CLEAN);
    await expect(run(['--coupling', '--size'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });
});

describe('resolveConfiguredEntryPoints via runCheckPerf (cov544)', () => {
  it('uses performance.entryPoints when present', async () => {
    resolveConfig.mockReturnValue({
      ok: true,
      value: { performance: { entryPoints: ['a.ts', 'b.ts'] } },
    });
    mockAnalyze.mockResolvedValue(CLEAN);
    const result = await runCheckPerf('/tmp/x', { configPath: 'cfg.json' });
    expect(result.ok).toBe(true);
    expect(resolveConfig).toHaveBeenCalledWith('cfg.json');
  });

  it('falls back to entropy.entryPoints when performance is absent', async () => {
    resolveConfig.mockReturnValue({
      ok: true,
      value: { entropy: { entryPoints: ['e.ts'] } },
    });
    mockAnalyze.mockResolvedValue(CLEAN);
    const result = await runCheckPerf('/tmp/x', {});
    expect(result.ok).toBe(true);
  });

  it('returns undefined entry points when neither block configures them', async () => {
    resolveConfig.mockReturnValue({ ok: true, value: {} });
    mockAnalyze.mockResolvedValue(CLEAN);
    const result = await runCheckPerf('/tmp/x', {});
    expect(result.ok).toBe(true);
  });

  it('unknown-severity violation ranks 0 and is dropped under a threshold filter', async () => {
    resolveConfig.mockReturnValue({ ok: false, error: new Error('none') });
    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        complexity: {
          violations: [
            {
              tier: 1,
              severity: 'trivia',
              metric: 'cc',
              file: 'a.ts',
              function: 'f',
              value: 1,
              threshold: 0,
              message: 'm',
            },
          ],
          stats: { filesAnalyzed: 1 },
        },
        coupling: { violations: [] },
        sizeBudget: { violations: [] },
      },
    });
    const result = await runCheckPerf('/tmp/x', { severity: 'info' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // severityRank('trivia') === 0 < info(1) so it is excluded from the report.
      expect(result.value.violations).toHaveLength(0);
      expect(result.value.valid).toBe(true);
    }
  });
});
