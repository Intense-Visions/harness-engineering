import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';

const mockDiscover = vi.fn();
const mockRun = vi.fn();
const mockBaselineLoad = vi.fn();
const mockBaselineSave = vi.fn();
const mockResolve = vi.fn();
const mockAnalyze = vi.fn();
const analyzerCtorArgs: unknown[] = [];
const mockResolveProject = vi.fn();

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();

  class MockBaselineManager {
    load = mockBaselineLoad;
    save = mockBaselineSave;
    constructor(_cwd: string) {}
  }

  class MockCriticalPathResolver {
    resolve = mockResolve;
    constructor(_cwd: string) {}
  }

  class MockBenchmarkRunner {
    discover = mockDiscover;
    run = mockRun;
  }

  class MockEntropyAnalyzer {
    analyze = mockAnalyze;
    constructor(opts: unknown) {
      analyzerCtorArgs.push(opts);
    }
  }

  return {
    ...actual,
    BaselineManager: MockBaselineManager,
    CriticalPathResolver: MockCriticalPathResolver,
    BenchmarkRunner: MockBenchmarkRunner,
    EntropyAnalyzer: MockEntropyAnalyzer,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn().mockReturnValue('abc1234\n'),
  };
});

vi.mock('../../src/config/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/loader')>();
  return {
    ...actual,
    resolveProject: (...args: unknown[]) => mockResolveProject(...args),
  };
});

import { createPerfCommand } from '../../src/commands/perf';
import { ExitCode } from '../../src/utils/errors';

describe('perf command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzerCtorArgs.length = 0;
    mockResolveProject.mockReturnValue({ ok: false, error: new Error('no config') });
  });

  describe('createPerfCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createPerfCommand();
      expect(cmd.name()).toBe('perf');
    });

    it('has description', () => {
      const cmd = createPerfCommand();
      expect(cmd.description()).toContain('Performance');
    });

    it('has bench subcommand', () => {
      const cmd = createPerfCommand();
      const sub = cmd.commands.find((c) => c.name() === 'bench');
      expect(sub).toBeDefined();
    });

    it('has baselines subcommand with show and update', () => {
      const cmd = createPerfCommand();
      const baselines = cmd.commands.find((c) => c.name() === 'baselines');
      expect(baselines).toBeDefined();
      const show = baselines!.commands.find((c) => c.name() === 'show');
      const update = baselines!.commands.find((c) => c.name() === 'update');
      expect(show).toBeDefined();
      expect(update).toBeDefined();
    });

    it('has report subcommand', () => {
      const cmd = createPerfCommand();
      const sub = cmd.commands.find((c) => c.name() === 'report');
      expect(sub).toBeDefined();
    });

    it('has critical-paths subcommand', () => {
      const cmd = createPerfCommand();
      const sub = cmd.commands.find((c) => c.name() === 'critical-paths');
      expect(sub).toBeDefined();
    });
  });

  describe('bench subcommand', () => {
    it('logs message when no bench files found (non-json)', async () => {
      mockDiscover.mockReturnValue([]);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      // Parse with bench subcommand; commander will invoke the action
      await cmd.parseAsync(['bench'], { from: 'user' });

      // Should not call run when no files discovered
      expect(mockRun).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('logs JSON when no bench files found and --json is set', async () => {
      mockDiscover.mockReturnValue([]);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      cmd.optsWithGlobals = () => ({ json: true });
      // Add --json as a parent option
      cmd.option('--json', 'JSON output');
      await cmd.parseAsync(['--json', 'bench'], { from: 'user' });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No .bench.ts files found'));
      logSpy.mockRestore();
    });

    it('runs benchmarks when files are found and outputs results', async () => {
      mockDiscover.mockReturnValue(['src/perf.bench.ts']);
      mockRun.mockResolvedValue({
        success: true,
        results: [{ file: 'src/perf.bench.ts', name: 'test-bench', opsPerSec: 1000, meanMs: 1.0 }],
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['bench'], { from: 'user' });

      expect(mockRun).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('baselines show subcommand', () => {
    it('prints message when no baselines file exists', async () => {
      mockBaselineLoad.mockReturnValue(null);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['baselines', 'show'], { from: 'user' });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No baselines file found'));
      logSpy.mockRestore();
    });

    it('prints baseline data when baselines exist', async () => {
      mockBaselineLoad.mockReturnValue({
        updatedAt: '2026-04-15T00:00:00.000Z',
        updatedFrom: 'abc1234',
        benchmarks: {
          'test-bench': { opsPerSec: 500, meanMs: 2.0, p99Ms: 5.0 },
        },
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['baselines', 'show'], { from: 'user' });

      // Verify load was called
      expect(mockBaselineLoad).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('prints JSON when --json flag is set', async () => {
      mockBaselineLoad.mockReturnValue({
        updatedAt: '2026-04-15T00:00:00.000Z',
        updatedFrom: 'abc1234',
        benchmarks: {
          'test-bench': { opsPerSec: 500, meanMs: 2.0, p99Ms: 5.0 },
        },
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      cmd.option('--json', 'JSON output');
      await cmd.parseAsync(['--json', 'baselines', 'show'], { from: 'user' });

      // The last call should be JSON output
      const jsonCalls = logSpy.mock.calls.filter((call) => {
        try {
          JSON.parse(String(call[0]));
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      logSpy.mockRestore();
    });
  });

  describe('baselines update subcommand', () => {
    it('shows error when benchmark run fails', async () => {
      mockRun.mockResolvedValue({ success: false, results: [] });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['baselines', 'update'], { from: 'user' });

      expect(mockBaselineSave).not.toHaveBeenCalled();
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('saves baselines when benchmark run succeeds', async () => {
      mockRun.mockResolvedValue({
        success: true,
        results: [{ file: 'src/perf.bench.ts', name: 'test-bench', opsPerSec: 1000, meanMs: 1.0 }],
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['baselines', 'update'], { from: 'user' });

      expect(mockBaselineSave).toHaveBeenCalledWith(
        [{ file: 'src/perf.bench.ts', name: 'test-bench', opsPerSec: 1000, meanMs: 1.0 }],
        expect.any(String)
      );
      logSpy.mockRestore();
    });
  });

  describe('critical-paths subcommand', () => {
    it('prints critical paths in text mode', async () => {
      mockResolve.mockResolvedValue({
        stats: { total: 2, annotated: 1, graphInferred: 1 },
        entries: [
          { file: 'src/core.ts', function: 'init', source: 'annotation', fanIn: 5 },
          { file: 'src/hub.ts', function: 'route', source: 'graph', fanIn: undefined },
        ],
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['critical-paths'], { from: 'user' });

      expect(mockResolve).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('prints JSON when --json flag is set', async () => {
      mockResolve.mockResolvedValue({
        stats: { total: 1, annotated: 1, graphInferred: 0 },
        entries: [{ file: 'src/core.ts', function: 'init', source: 'annotation', fanIn: 3 }],
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      cmd.option('--json', 'JSON output');
      await cmd.parseAsync(['--json', 'critical-paths'], { from: 'user' });

      const jsonCalls = logSpy.mock.calls.filter((call) => {
        try {
          const parsed = JSON.parse(String(call[0]));
          return parsed.stats !== undefined;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);
      logSpy.mockRestore();
    });
  });
  // #2084: a failed analysis used to log and return, so `perf report` exited 0
  // over an analysis that never ran.
  describe('report subcommand', () => {
    function stubExit() {
      return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
    }

    it('exits non-zero in text mode when the analysis fails', async () => {
      mockAnalyze.mockResolvedValue({
        ok: false,
        error: { message: 'Could not resolve entry points' },
      });
      const exitSpy = stubExit();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await expect(cmd.parseAsync(['report'], { from: 'user' })).rejects.toThrow(
        `process.exit(${ExitCode.ERROR})`
      );
      expect(exitSpy).toHaveBeenCalledWith(ExitCode.ERROR);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('exits non-zero and emits a JSON error object in --json mode when the analysis fails', async () => {
      mockAnalyze.mockResolvedValue({
        ok: false,
        error: { message: 'Could not resolve entry points' },
      });
      const exitSpy = stubExit();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      cmd.option('--json', 'JSON output');
      await expect(cmd.parseAsync(['--json', 'report'], { from: 'user' })).rejects.toThrow(
        `process.exit(${ExitCode.ERROR})`
      );
      expect(exitSpy).toHaveBeenCalledWith(ExitCode.ERROR);
      const jsonOut = logSpy.mock.calls
        .map((c) => {
          try {
            return JSON.parse(String(c[0]));
          } catch {
            return undefined;
          }
        })
        .find((v) => v !== undefined);
      expect(jsonOut).toEqual({ error: 'Could not resolve entry points' });

      exitSpy.mockRestore();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('passes configured performance.entryPoints to the analyzer', async () => {
      mockResolveProject.mockReturnValue({
        ok: true,
        value: {
          config: { performance: { entryPoints: ['packages/a/src/index.ts'] } },
          configPath: '/proj/harness.config.json',
          root: '/proj',
        },
      });
      mockAnalyze.mockResolvedValue({ ok: true, value: {} });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['report'], { from: 'user' });

      expect(analyzerCtorArgs).toHaveLength(1);
      expect(analyzerCtorArgs[0]).toMatchObject({
        rootDir: path.resolve('/proj'),
        entryPoints: ['packages/a/src/index.ts'],
      });
      logSpy.mockRestore();
    });

    it('leaves entry points to auto-detection when none are configured', async () => {
      mockAnalyze.mockResolvedValue({ ok: true, value: {} });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cmd = createPerfCommand();
      await cmd.parseAsync(['report'], { from: 'user' });

      expect(analyzerCtorArgs).toHaveLength(1);
      expect(analyzerCtorArgs[0]).not.toHaveProperty('entryPoints');
      logSpy.mockRestore();
    });
  });
});
