import { describe, it, expect, vi } from 'vitest';
import {
  buildDependencyGraph,
  validateDependencies,
  defineLayer,
} from '../../src/constraints/dependencies';
import { detectCircularDepsInFiles } from '../../src/constraints/circular-deps';
import type { GraphDependencyData } from '../../src/constraints/types';
import type { LanguageParser } from '../../src/shared/parsers';

// Mock parser that should NOT be called when graph data is provided
function createMockParser(): LanguageParser {
  return {
    name: 'mock-parser',
    health: vi.fn().mockResolvedValue({ ok: true, value: { available: true } }),
    parseFile: vi.fn().mockRejectedValue(new Error('Parser should not be called')),
    extractImports: vi.fn().mockReturnValue({ ok: false, error: {} }),
    extractExports: vi.fn().mockReturnValue({ ok: false, error: {} }),
  } as unknown as LanguageParser;
}

const mockGraphData: GraphDependencyData = {
  nodes: [
    '/project/src/api/handler.ts',
    '/project/src/domain/user.ts',
    '/project/src/shared/utils.ts',
  ],
  edges: [
    {
      from: '/project/src/api/handler.ts',
      to: '/project/src/domain/user.ts',
      importType: 'static',
      line: 1,
    },
    {
      from: '/project/src/domain/user.ts',
      to: '/project/src/shared/utils.ts',
      importType: 'static',
      line: 2,
    },
  ],
};

describe('constraint graph-integration', () => {
  describe('buildDependencyGraph with graphDependencyData', () => {
    it('returns graph from pre-computed data (skips parser)', async () => {
      const parser = createMockParser();
      const result = await buildDependencyGraph([], parser, mockGraphData);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.nodes).toEqual(mockGraphData.nodes);
      expect(result.value.edges).toEqual(mockGraphData.edges);
      expect(parser.parseFile).not.toHaveBeenCalled();
    });

    it('uses existing parser behavior without graphDependencyData', async () => {
      const parser = createMockParser();
      (parser.parseFile as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, value: {} });
      (parser.extractImports as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: [] });

      const result = await buildDependencyGraph(['/some/file.ts'], parser);

      expect(result.ok).toBe(true);
      expect(parser.parseFile).toHaveBeenCalledWith('/some/file.ts');
    });
  });

  describe('validateDependencies with graphDependencyData', () => {
    it('detects layer violations from graph edges', async () => {
      const parser = createMockParser();
      const layers = [
        defineLayer('api', ['src/api/**'], ['shared']), // api can only import shared, NOT domain
        defineLayer('domain', ['src/domain/**'], ['shared']),
        defineLayer('shared', ['src/shared/**'], []),
      ];

      const result = await validateDependencies({
        layers,
        rootDir: '/project',
        parser,
        graphDependencyData: mockGraphData,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
      expect(result.value.violations.length).toBe(1);
      expect(result.value.violations[0]!.fromLayer).toBe('api');
      expect(result.value.violations[0]!.toLayer).toBe('domain');
      // Parser should not be called — graph data bypasses it
      expect(parser.parseFile).not.toHaveBeenCalled();
    });

    it('returns valid when no violations exist', async () => {
      const parser = createMockParser();
      const layers = [
        defineLayer('api', ['src/api/**'], ['domain', 'shared']),
        defineLayer('domain', ['src/domain/**'], ['shared']),
        defineLayer('shared', ['src/shared/**'], []),
      ];

      const result = await validateDependencies({
        layers,
        rootDir: '/project',
        parser,
        graphDependencyData: mockGraphData,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.violations.length).toBe(0);
    });

    it('uses existing behavior without graphDependencyData', async () => {
      const parser = createMockParser();
      const layers = [defineLayer('api', ['src/api/**'], ['domain'])];

      const result = await validateDependencies({
        layers,
        rootDir: '/project',
        parser,
      });

      expect(result.ok).toBe(true);
      // Parser health was checked (existing behavior)
      expect(parser.health).toHaveBeenCalled();
    });
  });

  describe('detectCircularDepsInFiles with graphDependencyData', () => {
    it('detects cycles from graph data', async () => {
      const parser = createMockParser();
      const cyclicData: GraphDependencyData = {
        nodes: ['/a.ts', '/b.ts', '/c.ts'],
        edges: [
          { from: '/a.ts', to: '/b.ts', importType: 'static', line: 1 },
          { from: '/b.ts', to: '/c.ts', importType: 'static', line: 1 },
          { from: '/c.ts', to: '/a.ts', importType: 'static', line: 1 },
        ],
      };

      const result = await detectCircularDepsInFiles([], parser, cyclicData);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.hasCycles).toBe(true);
      expect(result.value.cycles.length).toBe(1);
      expect(result.value.cycles[0]!.size).toBe(3);
      expect(parser.parseFile).not.toHaveBeenCalled();
    });

    it('returns no cycles when acyclic graph data provided', async () => {
      const parser = createMockParser();
      const result = await detectCircularDepsInFiles([], parser, mockGraphData);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.hasCycles).toBe(false);
      expect(result.value.cycles.length).toBe(0);
    });
  });
});
