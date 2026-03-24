import { describe, it, expect } from 'vitest';
import { ResponseFormatter } from '../../src/nlq/ResponseFormatter.js';
import type { Intent, ResolvedEntity } from '../../src/nlq/types.js';
import type { GraphNode } from '../../src/types.js';

const formatter = new ResponseFormatter();

function makeEntity(
  raw: string,
  nodeType: string = 'file',
  path: string = 'src/auth.ts'
): ResolvedEntity {
  const node: GraphNode = {
    id: `node-${raw}`,
    type: nodeType as GraphNode['type'],
    name: raw,
    path,
    metadata: {},
  };
  return { raw, nodeId: node.id, node, confidence: 0.9, method: 'exact' };
}

// --- Impact intent ---
describe('ResponseFormatter', () => {
  describe('impact intent', () => {
    it('formats impact with typical data', () => {
      const result = formatter.format('impact', [makeEntity('AuthService')], {
        code: ['a.ts', 'b.ts'],
        tests: ['a.test.ts'],
        docs: ['README.md'],
        other: [],
      });
      expect(result).toBe('Changing **AuthService** affects 2 code files, 1 test, and 1 doc.');
    });

    it('formats impact with empty arrays', () => {
      const result = formatter.format('impact', [makeEntity('AuthService')], {
        code: [],
        tests: [],
        docs: [],
        other: [],
      });
      expect(result).toBe('Changing **AuthService** affects 0 code files, 0 tests, and 0 docs.');
    });

    it('formats impact with no entities', () => {
      const result = formatter.format('impact', [], {
        code: ['a.ts'],
        tests: [],
        docs: [],
        other: [],
      });
      expect(result).toContain('affects 1 code file');
    });
  });

  // --- Find intent ---
  describe('find intent', () => {
    it('formats find with typical data', () => {
      const result = formatter.format(
        'find',
        [makeEntity('auth')],
        [{ id: '1' }, { id: '2' }, { id: '3' }],
        'where is auth?'
      );
      expect(result).toBe('Found 3 matches for "where is auth?".');
    });

    it('formats find with empty results', () => {
      const result = formatter.format('find', [makeEntity('auth')], [], 'where is auth?');
      expect(result).toBe('Found 0 matches for "where is auth?".');
    });

    it('formats find without query string', () => {
      const result = formatter.format('find', [makeEntity('auth')], [{ id: '1' }]);
      expect(result).toBe('Found 1 match.');
    });
  });

  // --- Relationships intent ---
  describe('relationships intent', () => {
    it('formats relationships with typical data', () => {
      const entity = makeEntity('UserService');
      const result = formatter.format('relationships', [entity], {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [
          { from: entity.nodeId, to: 'a' },
          { from: entity.nodeId, to: 'b' },
          { from: 'c', to: entity.nodeId },
        ],
      });
      expect(result).toBe('**UserService** has 2 outbound and 1 inbound relationships.');
    });

    it('formats relationships with empty edges', () => {
      const result = formatter.format('relationships', [makeEntity('UserService')], {
        nodes: [],
        edges: [],
      });
      expect(result).toBe('**UserService** has 0 outbound and 0 inbound relationships.');
    });
  });

  // --- Explain intent ---
  describe('explain intent', () => {
    it('formats explain with typical data', () => {
      const entity = makeEntity('AuthService', 'class', 'src/services/auth.ts');
      const result = formatter.format('explain', [entity], {
        context: [
          {
            rootNode: entity.node,
            score: 1,
            nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            edges: [],
          },
        ],
      });
      expect(result).toBe(
        '**AuthService** is a class at `src/services/auth.ts`. Connected to 3 nodes.'
      );
    });

    it('formats explain with empty context', () => {
      const entity = makeEntity('AuthService', 'class', 'src/services/auth.ts');
      const result = formatter.format('explain', [entity], { context: [] });
      expect(result).toBe(
        '**AuthService** is a class at `src/services/auth.ts`. Connected to 0 nodes.'
      );
    });
  });

  // --- Anomaly intent ---
  describe('anomaly intent', () => {
    it('formats anomaly with typical data', () => {
      const result = formatter.format('anomaly', [], {
        statisticalOutliers: [{ nodeId: 'file:complex.ts' }, { nodeId: 'file:tangled.ts' }],
        articulationPoints: [{ nodeId: 'class:CoreService' }],
      });
      expect(result).toBe(
        'Found 3 anomalies: file:complex.ts, file:tangled.ts, class:CoreService.'
      );
    });

    it('formats anomaly with empty results', () => {
      const result = formatter.format('anomaly', [], {
        statisticalOutliers: [],
        articulationPoints: [],
      });
      expect(result).toBe('Found 0 anomalies.');
    });

    it('truncates anomaly list to top 3', () => {
      const result = formatter.format('anomaly', [], {
        statisticalOutliers: [{ nodeId: 'a1' }, { nodeId: 'a2' }, { nodeId: 'a3' }],
        articulationPoints: [{ nodeId: 'b1' }, { nodeId: 'b2' }],
      });
      // 2 outliers + 1 articulation point shown (top 3)
      expect(result).toBe('Found 5 anomalies: a1, a2, b1.');
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('returns fallback for null data', () => {
      const result = formatter.format('impact', [makeEntity('X')], null);
      expect(result).toBe('No results found.');
    });

    it('returns fallback for undefined data', () => {
      const result = formatter.format('impact', [makeEntity('X')], undefined);
      expect(result).toBe('No results found.');
    });

    it('returns fallback for unknown intent', () => {
      const result = formatter.format('unknown' as Intent, [makeEntity('X')], { foo: 'bar' });
      expect(result).toContain('results');
    });

    it('handles multiple entities by using the first one', () => {
      const result = formatter.format('impact', [makeEntity('A'), makeEntity('B')], {
        code: ['x.ts'],
        tests: [],
        docs: [],
        other: [],
      });
      expect(result).toBe('Changing **A** affects 1 code file, 0 tests, and 0 docs.');
    });
  });
});
