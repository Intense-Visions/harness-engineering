// packages/cli/tests/commands/cleanup-findings-items.test.ts
//
// #2133 / #2076 in-process: the `--findings-json` items builder, the dead-code
// `reason` rendering and the elision hint. The spawned-CLI e2e
// (`tests/integration/cleanup-findings-enumerable.e2e.test.ts`) proves the
// wiring end to end; this suite pins the same behavior where coverage sees it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveProjectFrom } from '../helpers/resolve-project-mock';

const analyzeResultHolder = { current: null as unknown };

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    EntropyAnalyzer: class {
      async analyze() {
        return analyzeResultHolder.current;
      }
    },
  };
});

vi.mock('../../src/config/loader', () => {
  const mock = { resolveConfig: vi.fn() };
  return { ...mock, resolveProject: resolveProjectFrom(mock.resolveConfig) };
});

import {
  runCleanup,
  printCleanupResult,
  buildCleanupFindingItems,
  createCleanupCommand,
} from '../../src/commands/cleanup';
import { OutputFormatter, OutputMode } from '../../src/output/formatter';
import { resolveConfig } from '../../src/config/loader';
import { parseFindingsContract } from '@harness-engineering/types';

const patternConfig = {
  patterns: [{ name: 'no-x', description: 'd', severity: 'error', files: ['**/*.ts'], rule: {} }],
};

function configure(): void {
  vi.mocked(resolveConfig).mockReturnValue({
    ok: true,
    value: {
      version: 1,
      rootDir: '.',
      docsDir: './docs',
      entropy: { excludePatterns: [], patterns: patternConfig },
    },
  } as never);
}

/** A report with one finding of every gating kind (dead file + dead export). */
const fullReport = {
  ok: true as const,
  value: {
    analysisErrors: [],
    drift: {
      drifts: [
        {
          docFile: 'docs/api.md',
          line: 7,
          type: 'api-signature',
          issue: 'NOT_FOUND',
          details: 'foo() is gone',
        },
      ],
    },
    deadCode: {
      deadFiles: [{ path: 'src/orphan.ts', reason: 'NO_IMPORTERS', exportCount: 1, lineCount: 3 }],
      deadExports: [
        {
          file: 'src/api.ts',
          name: 'publicThing',
          line: 12,
          type: 'function',
          isDefault: false,
          reason: 'PUBLIC_API_UNUSED',
        },
      ],
    },
    patterns: {
      violations: [
        { pattern: 'no-x', file: 'src/x.ts', line: 3, severity: 'error', message: 'no x' },
      ],
    },
  },
};

type Result = Parameters<typeof printCleanupResult>[0];

function resultWith(partial: Partial<Result>): Result {
  return {
    driftIssues: [],
    deadCode: [],
    patternViolations: [],
    totalIssues: 0,
    ran: { drift: true, deadCode: true, patterns: true, duplication: false },
    ...partial,
  };
}

function captureLog(fn: () => void): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

describe('runCleanup carries reason and line through (#2076)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configure();
    analyzeResultHolder.current = fullReport;
  });

  it('keeps the dead-code reason, the dead-export line and the pattern line', async () => {
    const result = await runCleanup({ cwd: '/tmp/test', type: 'all' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deadCode).toEqual([
      { file: 'src/orphan.ts', reason: 'NO_IMPORTERS' },
      { file: 'src/api.ts', symbol: 'publicThing', line: 12, reason: 'PUBLIC_API_UNUSED' },
    ]);
    expect(result.value.patternViolations).toEqual([
      { file: 'src/x.ts', line: 3, pattern: 'no-x', message: 'no x' },
    ]);
    expect(result.value.totalIssues).toBe(4);
  });
});

describe('buildCleanupFindingItems (#2133)', () => {
  it('flattens every gating finding, one item per counted finding', () => {
    const value = resultWith({
      driftIssues: [{ file: 'docs/a.md', line: 4, type: 'api-signature', issue: 'X: y' }],
      deadCode: [
        { file: 'src/dead.ts', reason: 'NO_IMPORTERS' },
        { file: 'src/api.ts', symbol: 'thing', line: 9, reason: 'PUBLIC_API_UNUSED' },
      ],
      patternViolations: [{ file: 'src/p.ts', line: 2, pattern: 'no-x', message: 'm' }],
      totalIssues: 4,
    });
    const items = buildCleanupFindingItems(value);
    expect(items).toHaveLength(value.totalIssues);
    expect(items).toEqual([
      { kind: 'drift', file: 'docs/a.md', line: 4, type: 'api-signature', message: 'X: y' },
      { kind: 'dead-code', file: 'src/dead.ts', reason: 'NO_IMPORTERS' },
      {
        kind: 'dead-code',
        file: 'src/api.ts',
        symbol: 'thing',
        line: 9,
        reason: 'PUBLIC_API_UNUSED',
      },
      { kind: 'pattern', file: 'src/p.ts', line: 2, pattern: 'no-x', message: 'm' },
    ]);
    // A dead FILE has no symbol/line keys at all, not `undefined` ones.
    expect(Object.keys(items[1]!)).toEqual(['kind', 'file', 'reason']);
  });

  it('is empty for a clean run', () => {
    expect(buildCleanupFindingItems(resultWith({}))).toEqual([]);
  });
});

describe('printCleanupResult rendering (#2133, #2076)', () => {
  const formatter = new OutputFormatter(OutputMode.TEXT);

  it('prints each dead-code row with its reason', () => {
    const lines = captureLog(() =>
      printCleanupResult(
        resultWith({
          deadCode: [
            { file: 'src/dead.ts', reason: 'NO_IMPORTERS' },
            { file: 'src/api.ts', symbol: 'thing', line: 9, reason: 'PUBLIC_API_UNUSED' },
          ],
          totalIssues: 2,
        }),
        formatter
      )
    );
    expect(lines).toContain('  - src/dead.ts [NO_IMPORTERS]');
    expect(lines).toContain('  - src/api.ts: thing [PUBLIC_API_UNUSED]');
    expect(lines.some((l) => l.includes('more'))).toBe(false);
  });

  it('caps both sections at 10 and says where the elided rows are', () => {
    const deadCode = Array.from({ length: 13 }, (_, i) => ({
      file: `src/d${i}.ts`,
      reason: 'NO_IMPORTERS',
    }));
    const patternViolations = Array.from({ length: 11 }, (_, i) => ({
      file: `src/p${i}.ts`,
      line: i,
      pattern: 'no-x',
      message: 'm',
    }));
    const lines = captureLog(() =>
      printCleanupResult(resultWith({ deadCode, patternViolations, totalIssues: 24 }), formatter)
    );
    expect(lines.filter((l) => l.startsWith('  - src/d'))).toHaveLength(10);
    expect(lines.filter((l) => l.startsWith('  - src/p'))).toHaveLength(10);
    expect(lines).toContain('  ... and 3 more (full list: --findings-json or --json)');
    expect(lines).toContain('  ... and 1 more (full list: --findings-json or --json)');
  });
});

describe('cleanup --findings-json action (#2133)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    configure();
    analyzeResultHolder.current = fullReport;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('emits a trailing contract line whose items enumerate every finding', async () => {
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    try {
      await createCleanupCommand().parseAsync(['node', 'cleanup', '--findings-json']);
    } finally {
      logSpy.mockRestore();
    }
    const contract = parseFindingsContract(lines.join('\n'));
    expect(contract).not.toBeNull();
    expect(contract!.findings).toBe(4);
    expect(contract!.check).toBe('cleanup');
    expect(contract!.items).toHaveLength(4);
    expect(contract!.items!.map((i) => i.kind)).toEqual([
      'drift',
      'dead-code',
      'dead-code',
      'pattern',
    ]);
    expect(contract!.items![2]).toMatchObject({
      symbol: 'publicThing',
      reason: 'PUBLIC_API_UNUSED',
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
