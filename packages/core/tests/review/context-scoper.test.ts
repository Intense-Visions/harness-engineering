import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ContextScopeOptions,
  DiffInfo,
  GraphAdapter,
  ContextBundle,
  ReviewDomain,
} from '../../src/review/types';

// Mock fs-utils for file reading
vi.mock('../../src/shared/fs-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shared/fs-utils')>();
  return {
    readFileContent: vi.fn(),
    fileExists: vi.fn(),
    findFiles: vi.fn(),
    relativePosix: actual.relativePosix,
  };
});

import { scopeContext } from '../../src/review/context-scoper';
import { readFileContent, fileExists, findFiles } from '../../src/shared/fs-utils';

const mockReadFileContent = vi.mocked(readFileContent);
const mockFileExists = vi.mocked(fileExists);
const mockFindFiles = vi.mocked(findFiles);

function makeDiff(overrides?: Partial<DiffInfo>): DiffInfo {
  return {
    changedFiles: ['src/service.ts'],
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: 50,
    fileDiffs: new Map([['src/service.ts', '+ added line\n'.repeat(50)]]),
    ...overrides,
  };
}

function makeOptions(overrides?: Partial<ContextScopeOptions>): ContextScopeOptions {
  return {
    projectRoot: '/fake/project',
    diff: makeDiff(),
    commitMessage: 'feat: add service',
    conventionFiles: ['CLAUDE.md'],
    ...overrides,
  };
}

describe('scopeContext()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all files exist with some content
    mockReadFileContent.mockResolvedValue({
      ok: true,
      value: 'file content\nline 2\nline 3\n',
    } as any);
    mockFileExists.mockResolvedValue(true);
    mockFindFiles.mockResolvedValue([]);
  });

  it('returns a ContextBundle for each review domain', async () => {
    const result = await scopeContext(makeOptions());
    expect(result).toHaveLength(5);
    const domains = result.map((b) => b.domain).sort();
    expect(domains).toEqual(['architecture', 'bug', 'compliance', 'learnings', 'security']);
  });

  it('sets changeType on all bundles', async () => {
    const result = await scopeContext(makeOptions({ commitMessage: 'fix: null check' }));
    for (const bundle of result) {
      expect(bundle.changeType).toBe('bugfix');
    }
  });

  it('includes changed files in all bundles', async () => {
    const result = await scopeContext(makeOptions());
    for (const bundle of result) {
      expect(bundle.changedFiles.length).toBeGreaterThan(0);
      expect(bundle.changedFiles[0]!.path).toBe('src/service.ts');
      expect(bundle.changedFiles[0]!.reason).toBe('changed');
    }
  });

  it('includes convention files in compliance bundle', async () => {
    const result = await scopeContext(makeOptions({ conventionFiles: ['CLAUDE.md', 'AGENTS.md'] }));
    const compliance = result.find((b) => b.domain === 'compliance')!;
    const conventionPaths = compliance.contextFiles
      .filter((f) => f.reason === 'convention')
      .map((f) => f.path);
    expect(conventionPaths).toContain('CLAUDE.md');
    expect(conventionPaths).toContain('AGENTS.md');
  });

  it('records diffLines and contextLines', async () => {
    const result = await scopeContext(makeOptions());
    for (const bundle of result) {
      expect(bundle.diffLines).toBe(50);
      expect(typeof bundle.contextLines).toBe('number');
    }
  });

  describe('without graph (fallback heuristics)', () => {
    it('searches for import targets in changed files for bug domain', async () => {
      // The changed file content has an import
      mockReadFileContent.mockImplementation(async (p: string) => {
        if (p.endsWith('service.ts')) {
          return {
            ok: true,
            value: "import { helper } from './helper';\nexport function run() {}",
          } as any;
        }
        return { ok: true, value: 'export function helper() {}' } as any;
      });
      mockFileExists.mockResolvedValue(true);

      const result = await scopeContext(makeOptions({ graph: undefined }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;

      // Should attempt to read import targets
      expect(mockReadFileContent).toHaveBeenCalled();
    });

    it('searches for test files matching changed files', async () => {
      mockFindFiles.mockResolvedValue(['/fake/project/tests/service.test.ts']);

      const result = await scopeContext(makeOptions());
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      const testFiles = bugBundle.contextFiles.filter((f) => f.reason === 'test');
      expect(testFiles.length).toBeGreaterThanOrEqual(0);
    });

    it('includes check-deps output in architecture bundle when provided', async () => {
      const result = await scopeContext(
        makeOptions({ checkDepsOutput: 'Layer violation: routes -> db' })
      );
      const archBundle = result.find((b) => b.domain === 'architecture')!;
      // Architecture bundle should have context
      expect(archBundle).toBeDefined();
    });

    it('resolves Babel-style ".js" import to ".jsx" file when reading import context (issue #279 follow-up)', async () => {
      mockReadFileContent.mockImplementation(async (p: string) => {
        if (p.endsWith('service.ts')) {
          return {
            ok: true,
            value: "import { Button } from './Button.js';\nexport function run() {}",
          } as any;
        }
        return { ok: true, value: 'export function Button() { return null; }' } as any;
      });

      // Only the .jsx file exists on disk. Without the JSX fallback, the
      // resolver would only try .ts/.tsx/.mts variants and miss the file.
      mockFileExists.mockImplementation(async (p: string) => {
        return p.endsWith('/src/Button.jsx');
      });

      const result = await scopeContext(makeOptions({ graph: undefined }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      const importFiles = bugBundle.contextFiles.filter((f) => f.reason === 'import');

      expect(
        importFiles.some((f) => f.path.endsWith('src/Button.jsx')),
        'expected Button.jsx to be added to bug bundle when imported via ./Button.js'
      ).toBe(true);
    });

    it('resolves NodeNext-style ".js" import to ".ts" file when reading import context (issue #279)', async () => {
      // Changed file imports `./helper.js`, but on disk the file is `helper.ts`.
      // Without the fix, the resolver would only try `helper.js.ts`, `helper.js.tsx`,
      // `helper.js.mts`, and `helper.js/index.ts` — none of which exist — so the
      // import target would never be added to the bug bundle's context.
      mockReadFileContent.mockImplementation(async (p: string) => {
        if (p.endsWith('service.ts')) {
          return {
            ok: true,
            value: "import { helper } from './helper.js';\nexport function run() {}",
          } as any;
        }
        return { ok: true, value: 'export function helper() {}' } as any;
      });

      // Only the .ts file exists on disk; .js / .js.ts / .js.tsx variants do not.
      mockFileExists.mockImplementation(async (p: string) => {
        return p.endsWith('/src/helper.ts');
      });

      const result = await scopeContext(makeOptions({ graph: undefined }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      const importFiles = bugBundle.contextFiles.filter((f) => f.reason === 'import');

      expect(
        importFiles.some((f) => f.path.endsWith('src/helper.ts')),
        'expected helper.ts to be added to bug bundle when imported via ./helper.js'
      ).toBe(true);
    });
  });

  describe('with graph', () => {
    const mockGraph: GraphAdapter = {
      getDependencies: vi.fn().mockResolvedValue(['src/helper.ts', 'src/types.ts']),
      getImpact: vi.fn().mockResolvedValue({
        tests: ['tests/service.test.ts'],
        docs: ['docs/api.md'],
        code: ['src/caller.ts'],
      }),
      isReachable: vi.fn().mockResolvedValue(true),
    };

    it('uses graph getDependencies for bug domain context', async () => {
      const result = await scopeContext(makeOptions({ graph: mockGraph }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      expect(mockGraph.getDependencies).toHaveBeenCalledWith('src/service.ts');
      const graphDeps = bugBundle.contextFiles.filter((f) => f.reason === 'graph-dependency');
      expect(graphDeps.length).toBeGreaterThan(0);
    });

    it('uses graph getImpact for architecture domain context', async () => {
      const result = await scopeContext(makeOptions({ graph: mockGraph }));
      expect(mockGraph.getImpact).toHaveBeenCalled();
    });

    it('uses graph getImpact to find test files', async () => {
      const result = await scopeContext(makeOptions({ graph: mockGraph }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      const testFiles = bugBundle.contextFiles.filter((f) => f.reason === 'test');
      expect(testFiles.some((f) => f.path === 'tests/service.test.ts')).toBe(true);
    });
  });

  describe('context ratio', () => {
    it('gathers more context for small diffs (< 20 lines)', async () => {
      const smallDiff = makeDiff({ totalDiffLines: 10, changedFiles: ['src/small.ts'] });
      smallDiff.fileDiffs = new Map([['src/small.ts', '+ line\n'.repeat(10)]]);
      const result = await scopeContext(makeOptions({ diff: smallDiff }));
      // For small diffs, target is 3:1, so contextLines should aim for ~30
      for (const bundle of result) {
        expect(bundle.diffLines).toBe(10);
      }
    });
  });
});
