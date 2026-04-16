import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createTraceabilityCommand } from '../../src/commands/traceability';

vi.mock('../../src/mcp/utils/graph-loader', () => ({
  loadGraphStore: vi.fn(),
}));

vi.mock('@harness-engineering/graph', () => ({
  queryTraceability: vi.fn(),
}));

const mockTraceResult = {
  specPath: 'specs/auth.md',
  featureName: 'Authentication',
  summary: {
    total: 2,
    fullyTraced: 1,
    withCode: 2,
    withTests: 1,
  },
  requirements: [
    {
      index: 1,
      requirementName: 'Login with email and password',
      codeFiles: [{ path: 'src/auth/login.ts', method: 'keyword' }],
      testFiles: [{ path: 'tests/auth/login.test.ts', method: 'keyword' }],
      maxConfidence: 0.9,
      status: 'full',
    },
    {
      index: 2,
      requirementName: 'Password reset flow',
      codeFiles: [{ path: 'src/auth/reset.ts', method: 'keyword' }],
      testFiles: [],
      maxConfidence: 0.3,
      status: 'code-only',
    },
  ],
};

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.option('--verbose', 'Verbose output');
  parent.option('--quiet', 'Quiet output');
  parent.addCommand(createTraceabilityCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', 'traceability', ...args]);
}

describe('traceability command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
  });

  describe('createTraceabilityCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createTraceabilityCommand();
      expect(cmd.name()).toBe('traceability');
    });

    it('has description', () => {
      const cmd = createTraceabilityCommand();
      expect(cmd.description()).toContain('traceability');
    });

    it('has --spec option', () => {
      const cmd = createTraceabilityCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--spec');
    });

    it('has --feature option', () => {
      const cmd = createTraceabilityCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--feature');
    });
  });

  describe('action - no store', () => {
    it('exits with error JSON when no store and --json', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      vi.mocked(loadGraphStore).mockResolvedValue(null as any);

      await expect(runCommand(['--json'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(2);
      const jsonOut = logOutput.find((l) => l.includes('error'));
      expect(jsonOut).toBeDefined();
      const parsed = JSON.parse(jsonOut!);
      expect(parsed.error).toContain('No knowledge graph found');
    });

    it('exits with error message when no store in text mode', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      vi.mocked(loadGraphStore).mockResolvedValue(null as any);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(2);
    });
  });

  describe('action - empty results', () => {
    it('exits with success JSON when no requirements found', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const graph = await import('@harness-engineering/graph');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as any);
      vi.mocked(graph.queryTraceability).mockReturnValue([]);

      await expect(runCommand(['--json'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      const jsonOut = logOutput.find((l) => l.includes('results'));
      expect(jsonOut).toBeDefined();
      const parsed = JSON.parse(jsonOut!);
      expect(parsed.results).toEqual([]);
    });
  });

  describe('action - with results', () => {
    it('outputs results as JSON', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const graph = await import('@harness-engineering/graph');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as any);
      vi.mocked(graph.queryTraceability).mockReturnValue([mockTraceResult]);

      await expect(runCommand(['--json'])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      const parsed = JSON.parse(logOutput[0]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].specPath).toBe('specs/auth.md');
    });

    it('outputs table in text mode', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const graph = await import('@harness-engineering/graph');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as any);
      vi.mocked(graph.queryTraceability).mockReturnValue([mockTraceResult]);

      await expect(runCommand([])).rejects.toThrow('process.exit');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(logOutput.find((l) => l.includes('Traceability'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('specs/auth.md'))).toBeDefined();
      expect(logOutput.find((l) => l.includes('Coverage'))).toBeDefined();
    });

    it('passes spec filter option', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const graph = await import('@harness-engineering/graph');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as any);
      vi.mocked(graph.queryTraceability).mockReturnValue([mockTraceResult]);

      await expect(runCommand(['--spec', 'specs/auth.md', '--json'])).rejects.toThrow(
        'process.exit'
      );
      expect(graph.queryTraceability).toHaveBeenCalledWith(
        { fake: 'store' },
        expect.objectContaining({ specPath: 'specs/auth.md' })
      );
    });

    it('passes feature filter option', async () => {
      const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
      const graph = await import('@harness-engineering/graph');
      vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as any);
      vi.mocked(graph.queryTraceability).mockReturnValue([mockTraceResult]);

      await expect(runCommand(['--feature', 'Authentication', '--json'])).rejects.toThrow(
        'process.exit'
      );
      expect(graph.queryTraceability).toHaveBeenCalledWith(
        { fake: 'store' },
        expect.objectContaining({ featureName: 'Authentication' })
      );
    });
  });
});
