import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

vi.mock('../../src/mcp/utils/graph-loader', () => ({ loadGraphStore: vi.fn() }));
vi.mock('@harness-engineering/graph', () => ({ queryTraceability: vi.fn() }));

import { createTraceabilityCommand } from '../../src/commands/traceability';

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
  parent.option('--json').option('--verbose').option('--quiet');
  parent.addCommand(createTraceabilityCommand());
  parent.exitOverride();
  return parent.parseAsync(['traceability', ...args], { from: 'user' });
}

// A result exercising every confidenceLabel + statusIcon branch and truncate.
const RICH_RESULT = {
  specPath: 'specs/x.md',
  featureName: 'X',
  summary: { total: 4, fullyTraced: 1, withCode: 3, withTests: 2 },
  requirements: [
    {
      index: 1,
      requirementName:
        'A very long requirement name that should exceed the column width and be truncated with an ellipsis',
      codeFiles: [{ path: 'src/a.ts', method: 'keyword' }],
      testFiles: [{ path: 'tests/a.test.ts', method: 'keyword' }],
      maxConfidence: 0.9, // explicit
      status: 'full',
    },
    {
      index: 2,
      requirementName: 'Inferred one',
      codeFiles: [{ path: 'src/b.ts', method: 'heuristic' }],
      testFiles: [],
      maxConfidence: 0.4, // inferred
      status: 'code-only',
    },
    {
      index: 3,
      requirementName: 'No confidence',
      codeFiles: [],
      testFiles: [{ path: 'tests/c.test.ts', method: 'name' }],
      maxConfidence: 0, // em-dash
      status: 'test-only',
    },
    {
      index: 4,
      requirementName: 'Weird status',
      codeFiles: [],
      testFiles: [],
      maxConfidence: 0,
      status: 'mystery', // default branch of statusIcon
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
  vi.spyOn(process, 'cwd').mockReturnValue('/tmp/fake-project');
});

afterAll(() => {
  logSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('traceability rendering branches (cov544b)', () => {
  it('verbose mode lists code/test files and covers all label + status branches', async () => {
    const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
    const graph = await import('@harness-engineering/graph');
    vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
    vi.mocked(graph.queryTraceability).mockReturnValue([RICH_RESULT] as never);

    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    const out = logOutput.join('\n');
    // verbose file listings
    expect(out).toContain('code: src/a.ts (keyword)');
    expect(out).toContain('test: tests/a.test.ts (keyword)');
    // truncation ellipsis
    expect(out).toContain('...');
    // status icons (default branch prints the raw status string)
    expect(out).toContain('mystery');
    expect(out).toContain('Coverage');
  });

  it('quiet mode with empty results exits SUCCESS and stays silent', async () => {
    const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
    const graph = await import('@harness-engineering/graph');
    vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
    vi.mocked(graph.queryTraceability).mockReturnValue([] as never);

    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    // handleEmptyResults suppresses the info line in quiet mode
    expect(logOutput.join('\n')).not.toContain('No requirements found');
  });

  it('text mode with results renders the table and coverage summary', async () => {
    const { loadGraphStore } = await import('../../src/mcp/utils/graph-loader');
    const graph = await import('@harness-engineering/graph');
    vi.mocked(loadGraphStore).mockResolvedValue({ fake: 'store' } as never);
    vi.mocked(graph.queryTraceability).mockReturnValue([RICH_RESULT] as never);

    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Traceability');
    expect(out).toContain('specs/x.md');
    // 1/4 fully traced => 25%
    expect(out).toContain('25% fully traced');
  });
});
