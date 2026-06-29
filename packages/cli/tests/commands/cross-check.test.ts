import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createCrossCheckCommand } from '../../src/commands/cross-check';

vi.mock('../../src/commands/validate-cross-check', () => ({
  runCrossCheck: vi.fn(),
}));

interface CrossCheckValue {
  specToPlan: string[];
  planToImpl: string[];
  staleness: string[];
  warnings: number;
}

function okResult(value: Partial<CrossCheckValue>) {
  return {
    ok: true as const,
    value: {
      specToPlan: [],
      planToImpl: [],
      staleness: [],
      warnings: 0,
      ...value,
    },
  };
}

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.option('--verbose', 'Verbose output');
  parent.option('--quiet', 'Quiet output');
  parent.addCommand(createCrossCheckCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', 'cross-check', ...args]);
}

describe('cross-check command', () => {
  let logOutput: string[];
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
  });

  describe('createCrossCheckCommand', () => {
    it('creates command with correct name', () => {
      expect(createCrossCheckCommand().name()).toBe('cross-check');
    });

    it('has description mentioning consistency', () => {
      expect(createCrossCheckCommand().description().toLowerCase()).toContain('consistency');
    });

    it('has --specs-dir and --plans-dir options', () => {
      const opts = createCrossCheckCommand().options.map((o) => o.long);
      expect(opts).toContain('--specs-dir');
      expect(opts).toContain('--plans-dir');
    });
  });

  describe('clean (no issues)', () => {
    it('prints a parseable 0-count line and exits 0', async () => {
      const { runCrossCheck } = await import('../../src/commands/validate-cross-check');
      vi.mocked(runCrossCheck).mockResolvedValue(okResult({ warnings: 0 }) as never);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(logOutput.find((l) => l.includes('Cross-check: 0 issues'))).toBeDefined();
    });
  });

  describe('with findings', () => {
    it('prints the parseable count and exits 1', async () => {
      const { runCrossCheck } = await import('../../src/commands/validate-cross-check');
      vi.mocked(runCrossCheck).mockResolvedValue(
        okResult({
          planToImpl: ['plan-a.md: planned file not found: src/x.ts'],
          staleness: ['plan-b.md: implementation newer than plan (src/y.ts)'],
          warnings: 2,
        }) as never
      );

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(1);
      const countLine = logOutput.find((l) => l.includes('Cross-check: 2 issues'));
      expect(countLine).toBeDefined();
      // The count line must be free of ANSI styling so the maintenance parser
      // can recover the number.
      // eslint-disable-next-line no-control-regex
      expect(countLine).not.toMatch(/\[/);
    });

    it('emits machine output as JSON with --json', async () => {
      const { runCrossCheck } = await import('../../src/commands/validate-cross-check');
      vi.mocked(runCrossCheck).mockResolvedValue(
        okResult({ planToImpl: ['x'], warnings: 1 }) as never
      );

      await expect(runCommand(['--json'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(1);
      const parsed = JSON.parse(logOutput[0]!);
      expect(parsed.warnings).toBe(1);
      expect(parsed.planToImpl).toEqual(['x']);
    });
  });

  describe('error from core', () => {
    it('exits 2 when the core returns an error', async () => {
      const { runCrossCheck } = await import('../../src/commands/validate-cross-check');
      vi.mocked(runCrossCheck).mockResolvedValue({
        ok: false,
        error: { message: 'boom' },
      } as never);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(2);
    });
  });
});
