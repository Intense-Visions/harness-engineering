import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createStaleConstraintsCommand } from '../../src/commands/stale-constraints';

vi.mock('../../src/mcp/utils/graph-loader', () => ({
  loadGraphStore: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({
  detectStaleConstraints: vi.fn(),
}));

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.option('--verbose', 'Verbose output');
  parent.option('--quiet', 'Quiet output');
  parent.addCommand(createStaleConstraintsCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', 'stale-constraints', ...args]);
}

describe('stale-constraints command', () => {
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

  describe('createStaleConstraintsCommand', () => {
    it('creates command with correct name', () => {
      expect(createStaleConstraintsCommand().name()).toBe('stale-constraints');
    });

    it('has --window and --category options', () => {
      const opts = createStaleConstraintsCommand().options.map((o) => o.long);
      expect(opts).toContain('--window');
      expect(opts).toContain('--category');
    });
  });

  describe('no graph (precondition)', () => {
    it('emits the scan precondition signature and exits non-zero (skipped by runner)', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      vi.mocked(loadGraphStore).mockResolvedValue(null as never);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      // Non-zero exit + no parseable count → runner flags executionFailed, then
      // the precondition signature downgrades it to `skipped`.
      expect(processExitSpy).toHaveBeenCalledWith(2);
      const signal = logOutput.find((l) => l.includes('No knowledge graph found'));
      expect(signal).toBeDefined();
      expect(signal).toMatch(/harness scan/);
      // No findings-count keyword that could mis-parse as a real finding.
      expect(logOutput.join('\n')).not.toMatch(/\d+\s+findings?/i);
    });

    it('emits a JSON error envelope with --json and no graph', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      vi.mocked(loadGraphStore).mockResolvedValue(null as never);

      await expect(runCommand(['--json'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(2);
      const parsed = JSON.parse(logOutput[0]!);
      expect(parsed.error).toContain('No knowledge graph found');
    });
  });

  describe('with a graph', () => {
    it('clean: prints a 0-count line and exits 0', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const core = await import('@harness-engineering/core');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
      vi.mocked(core.detectStaleConstraints).mockReturnValue({
        staleConstraints: [],
        totalConstraints: 5,
        windowDays: 30,
      } as never);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(logOutput.find((l) => l.includes('Stale constraints: 0 findings'))).toBeDefined();
    });

    it('with stale constraints: prints the parseable count and exits 1', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const core = await import('@harness-engineering/core');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
      vi.mocked(core.detectStaleConstraints).mockReturnValue({
        staleConstraints: [
          {
            id: 'c1',
            category: 'complexity',
            description: 'x',
            scope: 'project',
            lastViolatedAt: null,
            daysSinceLastViolation: 90,
          },
          {
            id: 'c2',
            category: 'coupling',
            description: 'y',
            scope: 'project',
            lastViolatedAt: null,
            daysSinceLastViolation: 60,
          },
        ],
        totalConstraints: 5,
        windowDays: 30,
      } as never);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(1);
      const countLine = logOutput.find((l) => l.includes('Stale constraints: 2 findings'));
      expect(countLine).toBeDefined();
    });

    it('passes the --window value through to the core', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const core = await import('@harness-engineering/core');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
      vi.mocked(core.detectStaleConstraints).mockReturnValue({
        staleConstraints: [],
        totalConstraints: 0,
        windowDays: 60,
      } as never);

      await expect(runCommand(['--window', '60'])).rejects.toThrow('process.exit');
      expect(core.detectStaleConstraints).toHaveBeenCalledWith({ fake: 'store' }, 60, undefined);
    });
  });

  describe('invalid input', () => {
    it('rejects a non-numeric window with exit 2', async () => {
      await expect(runCommand(['--window', 'abc'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(2);
    });

    it('rejects an unknown category with exit 2', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
      await expect(runCommand(['--category', 'bogus'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(2);
    });
  });
});
