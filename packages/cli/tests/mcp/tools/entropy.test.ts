import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectEntropyDefinition, handleDetectEntropy } from '../../../src/mcp/tools/entropy';

vi.mock('../../../src/mcp/utils/sanitize-path.js', () => ({
  sanitizePath: vi.fn((p: string) => p),
}));

vi.mock('../../../src/mcp/utils/graph-loader.js', () => ({
  loadGraphStore: vi.fn().mockResolvedValue(null),
}));

const entropyAnalyzeResult = {
  current: {
    ok: true as const,
    value: {
      drift: {
        drifts: [{ type: 'outdated', file: 'docs/api.md', docFile: 'docs/api.md' }],
      },
      deadCode: {
        deadFiles: [{ path: 'src/old.ts' }],
        deadExports: [{ name: 'unused', file: 'src/utils.ts' }],
        unusedImports: [{ specifiers: ['foo'], source: 'bar' }],
      },
      patterns: {
        violations: [{ pattern: 'no-any', file: 'src/hack.ts' }],
      },
    },
  } as unknown,
};

const mockCreateFixes = vi
  .fn()
  .mockReturnValue([{ file: 'src/old.ts', action: 'remove-dead-file' }]);
const mockApplyFixes = vi.fn().mockResolvedValue({
  ok: true,
  value: { applied: [{ file: 'src/old.ts', action: 'remove-dead-file' }], skipped: [], errors: [] },
});
const mockGenerateSuggestions = vi.fn().mockReturnValue({ suggestions: [] });

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    Ok: actual.Ok,
    EntropyAnalyzer: class {
      constructor() {}
      async analyze() {
        return entropyAnalyzeResult.current;
      }
    },
    createFixes: (...args: unknown[]) => mockCreateFixes(...args),
    applyFixes: (...args: unknown[]) => mockApplyFixes(...args),
    generateSuggestions: (...args: unknown[]) => mockGenerateSuggestions(...args),
  };
});

vi.mock('@harness-engineering/graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/graph')>();
  return {
    ...actual,
    GraphEntropyAdapter: vi.fn(),
  };
});

// Mocks are defined above via mockCreateFixes, mockApplyFixes, mockGenerateSuggestions

const defaultAnalyzeResult = {
  ok: true as const,
  value: {
    drift: {
      drifts: [{ type: 'outdated', file: 'docs/api.md', docFile: 'docs/api.md' }],
    },
    deadCode: {
      deadFiles: [{ path: 'src/old.ts' }],
      deadExports: [{ name: 'unused', file: 'src/utils.ts' }],
      unusedImports: [{ specifiers: ['foo'], source: 'bar' }],
    },
    patterns: {
      violations: [{ pattern: 'no-any', file: 'src/hack.ts' }],
    },
    // `EntropyReport.snapshot` is REQUIRED
    // (`core/src/entropy/types/report.ts:25`) and the detailed response
    // projects it (the per-file `ast` is stripped — an in-process parse tree
    // no MCP caller can act on, and 80% of the payload). This mock omitted it
    // entirely, so it described a report the analyzer cannot produce.
    snapshot: {
      files: [
        {
          path: 'src/old.ts',
          ast: { type: 'Program', body: [] },
          imports: [],
          exports: [],
          internalSymbols: [],
          jsDocComments: [],
        },
      ],
    },
  },
};

describe('detect_entropy tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entropyAnalyzeResult.current = defaultAnalyzeResult;
    mockCreateFixes.mockReturnValue([{ file: 'src/old.ts', action: 'remove-dead-file' }]);
    mockApplyFixes.mockResolvedValue({
      ok: true,
      value: {
        applied: [{ file: 'src/old.ts', action: 'remove-dead-file' }],
        skipped: [],
        errors: [],
      },
    });
    mockGenerateSuggestions.mockReturnValue({ suggestions: [] });
  });

  describe('definition', () => {
    it('has type parameter in definition', () => {
      expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('type');
      expect(detectEntropyDefinition.inputSchema.properties.type.enum).toEqual([
        'drift',
        'dead-code',
        'patterns',
        'duplication',
        'all',
      ]);
    });

    it('has autoFix parameter in definition', () => {
      expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('autoFix');
    });

    it('has dryRun parameter in definition', () => {
      expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('dryRun');
    });

    it('has fixTypes parameter in definition', () => {
      expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('fixTypes');
    });

    it('has mode parameter in definition', () => {
      expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('mode');
      expect(detectEntropyDefinition.inputSchema.properties.mode.enum).toEqual([
        'summary',
        'detailed',
      ]);
    });

    it('description mentions fix capability', () => {
      expect(detectEntropyDefinition.description).toContain('fix');
    });
  });

  describe('handleDetectEntropy', () => {
    it('returns analysis results in detailed mode by default', async () => {
      const result = await handleDetectEntropy({ path: '/tmp/project' });
      expect(result.content).toHaveLength(1);
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('drift');
      expect(data).toHaveProperty('deadCode');
      // The snapshot survives, its per-file ASTs do not.
      expect(data.snapshot.files[0].path).toBe('src/old.ts');
      expect('ast' in data.snapshot.files[0]).toBe(false);
    });

    // SURVIVING MUTANT M6: removing the `skipErrors[].details.originalError`
    // strip from `toJsonSafeReport` left the suite green, because the real
    // fixture used by the duplication suite yields `skipErrors: []` and the
    // `.map()` never executes. The changeset and the function's own comment
    // both advertise this projection, and a regression reinstates the
    // `{}`-serializes-away defect that spec Phase 3 forward note 4 exists to
    // prevent. One hand-built entry through the mocked analyzer seam is enough
    // to execute the branch.
    it('strips the unserializable originalError from a skipErrors entry', async () => {
      entropyAnalyzeResult.current = {
        ok: true as const,
        value: {
          ...defaultAnalyzeResult.value,
          duplication: {
            classes: [],
            byMember: new Map([['src/x.ts#alpha', 'aaaa1111']]),
            collisions: [],
            skipErrors: [
              {
                code: 'READ_FAILED',
                message: 'Could not read src/unreadable.ts',
                details: {
                  reason: 'unreadable',
                  file: 'src/unreadable.ts',
                  // An `Error`, which `JSON.stringify` renders as `{}` — a key
                  // that reads as an empty object rather than an
                  // unserializable one.
                  originalError: new Error('EACCES: permission denied'),
                },
                suggestions: ['Check the file permissions'],
              },
            ],
            stats: { filesScanned: 1, filesSkipped: 1, classesReported: 0 },
          },
        },
      } as unknown;

      const result = await handleDetectEntropy({ path: '/tmp/project' });
      const data = JSON.parse(result.content[0].text);
      // Below the middleware, so `skipErrors` is still an array of one (over
      // the wire the structural pass would collapse it — see the note on
      // `summarizeDuplication`).
      const skip = data.duplication.skipErrors[0];
      // MUTATION: return `skipErrors` unmapped and `originalError: {}` is back.
      expect('originalError' in skip.details).toBe(false);
      // Everything a reader can act on survives.
      expect(skip.message).toContain('Could not read src/unreadable.ts');
      expect(skip.details.reason).toBe('unreadable');
      expect(skip.details.file).toBe('src/unreadable.ts');
      expect(skip.code).toBe('READ_FAILED');
      // And the Map is omitted rather than shipped as `{}`.
      expect('byMember' in data.duplication).toBe(false);
    });

    it('returns summary mode response when mode=summary', async () => {
      const result = await handleDetectEntropy({ path: '/tmp/project', mode: 'summary' });
      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0].text);
      expect(data.mode).toBe('summary');
      expect(data).toHaveProperty('totalIssues');
      expect(data).toHaveProperty('categories');
      expect(data.categories).toHaveProperty('drift');
      expect(data.categories).toHaveProperty('deadCode');
      expect(data.categories).toHaveProperty('patterns');
    });

    it('summary mode counts issues correctly', async () => {
      const result = await handleDetectEntropy({ path: '/tmp/project', mode: 'summary' });
      const data = JSON.parse(result.content[0].text);
      // 1 drift + (1 unused import + 1 dead export + 1 dead file) + 1 pattern = 5
      expect(data.totalIssues).toBe(5);
      expect(data.categories.drift.issueCount).toBe(1);
      expect(data.categories.deadCode.issueCount).toBe(3);
      expect(data.categories.patterns.issueCount).toBe(1);
    });

    it('uses type filter to configure analyzer', async () => {
      const result = await handleDetectEntropy({ path: '/tmp/project', type: 'drift' });
      // Should still succeed with type filter
      expect(result.content).toHaveLength(1);
    });

    it('applies fixes in autoFix mode', async () => {
      const result = await handleDetectEntropy({
        path: '/tmp/project',
        autoFix: true,
      });
      expect(mockCreateFixes).toHaveBeenCalled();
      expect(mockApplyFixes).toHaveBeenCalled();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('analysis');
    });

    it('returns dry-run preview when autoFix + dryRun', async () => {
      const result = await handleDetectEntropy({
        path: '/tmp/project',
        autoFix: true,
        dryRun: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('analysis');
      expect(data).toHaveProperty('fixes');
      expect(data).toHaveProperty('suggestions');
      expect(mockApplyFixes).not.toHaveBeenCalled();
    });

    it('handles analysis failure in autoFix mode', async () => {
      entropyAnalyzeResult.current = {
        ok: false,
        error: { message: 'Analysis failed' },
      };

      const result = await handleDetectEntropy({ path: '/tmp/project', autoFix: true });
      expect(result.isError).toBe(true);
    });

    it('handles applyFixes failure', async () => {
      mockApplyFixes.mockResolvedValueOnce({
        ok: false,
        error: { message: 'Apply failed' },
      });

      const result = await handleDetectEntropy({ path: '/tmp/project', autoFix: true });
      expect(result.isError).toBe(true);
    });

    it('returns ok with no fixes when autoFix but no dead code fixes', async () => {
      mockCreateFixes.mockReturnValueOnce([]);

      const result = await handleDetectEntropy({ path: '/tmp/project', autoFix: true });
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('analysis');
    });

    it('returns error response on thrown exception', async () => {
      entropyAnalyzeResult.current = 'THROW';

      // Override the analyze to throw
      const origCurrent = entropyAnalyzeResult.current;
      entropyAnalyzeResult.current = null;

      // We need a different approach - make the import itself fail
      // Instead, test with a sanitizePath that throws
      const { sanitizePath } = await import('../../../src/mcp/utils/sanitize-path.js');
      vi.mocked(sanitizePath).mockImplementationOnce(() => {
        throw new Error('Import failed');
      });

      const result = await handleDetectEntropy({ path: '/tmp/project' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Import failed');
    });

    it('passes fixTypes to createFixes', async () => {
      const fixTypes = ['unused-imports', 'dead-files'];
      await handleDetectEntropy({
        path: '/tmp/project',
        autoFix: true,
        fixTypes,
      });
      expect(mockCreateFixes).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fixTypes })
      );
    });
  });
});
