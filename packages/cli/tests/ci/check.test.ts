import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    runCIChecks: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        version: 1,
        project: 'test',
        timestamp: new Date().toISOString(),
        checks: [
          { name: 'validate', status: 'pass', issues: [], durationMs: 10 },
          { name: 'deps', status: 'pass', issues: [], durationMs: 5 },
          { name: 'docs', status: 'pass', issues: [], durationMs: 8 },
          { name: 'entropy', status: 'pass', issues: [], durationMs: 12 },
          { name: 'phase-gate', status: 'pass', issues: [], durationMs: 3 },
        ],
        summary: { total: 5, passed: 5, failed: 0, warnings: 0, skipped: 0 },
        exitCode: 0,
      },
    }),
  };
});

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn().mockReturnValue({
    ok: true,
    value: { version: 1, rootDir: '.', agentsMapPath: './AGENTS.md', docsDir: './docs' },
  }),
}));

import { runCICheck, createCheckCommand } from '../../src/commands/ci/check';
import { runCIChecks } from '@harness-engineering/core';
import { resolveConfig } from '../../src/config/loader';

describe('ci check command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runCICheck', () => {
    it('returns a CICheckReport result', async () => {
      const result = await runCICheck({});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.version).toBe(1);
      expect(result.value.checks).toHaveLength(5);
    });

    it('passes skip option through to core', async () => {
      const result = await runCICheck({ skip: ['entropy', 'docs'] });
      expect(result.ok).toBe(true);
      expect(runCIChecks).toHaveBeenCalledWith(
        expect.objectContaining({ skip: ['entropy', 'docs'] })
      );
    });

    it('passes failOn option through to core', async () => {
      const result = await runCICheck({ failOn: 'warning' });
      expect(result.ok).toBe(true);
      expect(runCIChecks).toHaveBeenCalledWith(expect.objectContaining({ failOn: 'warning' }));
    });

    it('returns error when config loading fails', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config not found', exitCode: 2 },
      } as never);

      const result = await runCICheck({});
      expect(result.ok).toBe(false);
    });

    it('returns error when runCIChecks fails', async () => {
      vi.mocked(runCIChecks).mockResolvedValueOnce({
        ok: false,
        error: new Error('Check failed'),
      } as never);

      const result = await runCICheck({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Check failed');
      }
    });

    it('passes configPath to resolveConfig', async () => {
      await runCICheck({ configPath: '/custom/config.json' });
      expect(resolveConfig).toHaveBeenCalledWith('/custom/config.json');
    });

    it('does not include skip in input when not provided', async () => {
      await runCICheck({});
      expect(runCIChecks).toHaveBeenCalledWith(
        expect.not.objectContaining({ skip: expect.anything() })
      );
    });

    it('does not include failOn in input when not provided', async () => {
      await runCICheck({});
      expect(runCIChecks).toHaveBeenCalledWith(
        expect.not.objectContaining({ failOn: expect.anything() })
      );
    });
  });

  describe('createCheckCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckCommand();
      expect(cmd.name()).toBe('check');
    });

    it('has skip option', () => {
      const cmd = createCheckCommand();
      const opt = cmd.options.find((o) => o.long === '--skip');
      expect(opt).toBeDefined();
    });

    it('has fail-on option with default error', () => {
      const cmd = createCheckCommand();
      const opt = cmd.options.find((o) => o.long === '--fail-on');
      expect(opt).toBeDefined();
      expect(opt?.defaultValue).toBe('error');
    });

    it('has correct description', () => {
      const cmd = createCheckCommand();
      expect(cmd.description()).toContain('CI');
    });
  });

  describe('action handler', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;

    const exitError = new Error('process.exit');

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        throw exitError;
      }) as never);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
    });

    async function safeParseAsync(program: any, args: string[]) {
      try {
        await program.parseAsync(args);
      } catch (e) {
        if (e !== exitError) throw e;
      }
    }

    function makeProgram() {
      const { Command } = require('commander');
      const program = new Command();
      program.option('--json', 'JSON output');
      program.option('--quiet', 'Quiet output');
      program.option('--verbose', 'Verbose');
      program.option('-c, --config <path>', 'Config');
      program.addCommand(createCheckCommand());
      return program;
    }

    it('prints report and exits with 0 when checks pass', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'check']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs JSON when --json is set', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '--json', 'check']);

      expect(mockConsoleLog).toHaveBeenCalled();
      // First call should be JSON output
      const output = mockConsoleLog.mock.calls[0]?.[0];
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('exits with error code when runCICheck returns error', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config error', exitCode: 2 },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'check']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs JSON error when --json and error occurs', async () => {
      vi.mocked(resolveConfig).mockReturnValueOnce({
        ok: false,
        error: { message: 'Config error', exitCode: 2 },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '--json', 'check']);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Config error'));
    });

    it('parses --skip flag correctly', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'check', '--skip', 'entropy,docs']);

      expect(runCIChecks).toHaveBeenCalledWith(
        expect.objectContaining({ skip: ['entropy', 'docs'] })
      );
    });

    it('parses --fail-on warning correctly', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'check', '--fail-on', 'warning']);

      expect(runCIChecks).toHaveBeenCalledWith(expect.objectContaining({ failOn: 'warning' }));
    });

    it('exits with report exitCode when checks have failures', async () => {
      vi.mocked(runCIChecks).mockResolvedValueOnce({
        ok: true,
        value: {
          version: 1,
          project: 'test',
          timestamp: new Date().toISOString(),
          checks: [
            {
              name: 'validate',
              status: 'fail',
              issues: [{ severity: 'error', message: 'Invalid' }],
              durationMs: 10,
            },
          ],
          summary: { total: 1, passed: 0, failed: 1, warnings: 0, skipped: 0 },
          exitCode: 1,
        },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'check']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('suppresses output in quiet mode', async () => {
      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '--quiet', 'check']);

      // In quiet mode, no console.log for the report
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('handles warn and skip status in report output', async () => {
      vi.mocked(runCIChecks).mockResolvedValueOnce({
        ok: true,
        value: {
          version: 1,
          project: 'test',
          timestamp: new Date().toISOString(),
          checks: [
            {
              name: 'validate',
              status: 'warn',
              issues: [{ severity: 'warning', message: 'Minor issue' }],
              durationMs: 10,
            },
            {
              name: 'entropy',
              status: 'skip',
              issues: [],
              durationMs: 0,
            },
          ],
          summary: { total: 2, passed: 0, failed: 0, warnings: 1, skipped: 1 },
          exitCode: 0,
        },
      } as never);

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', 'check']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
