import { describe, it, expect } from 'vitest';
import { detectDocDrift } from '../../src/entropy/detectors/drift';
import { detectDeadCode } from '../../src/entropy/detectors/dead-code';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';
import type { CodebaseSnapshot, EntropyConfig } from '../../src/entropy/types';

/**
 * Minimal empty snapshot for testing graph-enhanced mode.
 * Graph-enhanced mode bypasses snapshot-based analysis, so the snapshot
 * just needs to satisfy the type requirements.
 */
const emptySnapshot: CodebaseSnapshot = {
  files: [],
  dependencyGraph: { nodes: [], edges: [] },
  exportMap: { byFile: new Map(), byName: new Map() },
  docs: [],
  codeReferences: [],
  entryPoints: [],
  rootDir: '/tmp/test',
  config: {
    rootDir: '/tmp/test',
    analyze: {},
  } as EntropyConfig,
  buildTime: 0,
};

describe('graph-enhanced entropy detection', () => {
  describe('detectDocDrift with graphDriftData', () => {
    it('returns drift from graph edges', async () => {
      const graphDriftData = {
        staleEdges: [
          { docNodeId: 'doc:readme.md', codeNodeId: 'code:getUserById', edgeType: 'references' },
          { docNodeId: 'doc:api.md', codeNodeId: 'code:createUser', edgeType: 'documents' },
        ],
        missingTargets: ['code:deletedFunction'],
      };

      const result = await detectDocDrift(emptySnapshot, {}, graphDriftData);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const report = result.value;
      expect(report.drifts).toHaveLength(3);
      expect(report.stats.driftsFound).toBe(3);
      expect(report.stats.docsScanned).toBe(2);
      expect(report.stats.referencesChecked).toBe(3);

      // All should be api-signature type with NOT_FOUND issue
      for (const drift of report.drifts) {
        expect(drift.type).toBe('api-signature');
        expect(drift.issue).toBe('NOT_FOUND');
      }

      // Check missing target drift
      const missingDrift = report.drifts.find((d) => d.reference === 'code:deletedFunction');
      expect(missingDrift).toBeDefined();
      expect(missingDrift!.context).toBe('graph-missing-target');

      // Check stale edge drift
      const staleDrift = report.drifts.find((d) => d.reference === 'code:getUserById');
      expect(staleDrift).toBeDefined();
      expect(staleDrift!.context).toContain('graph-stale-edge');
    });

    it('without graphDriftData uses existing behavior', async () => {
      const result = await detectDocDrift(emptySnapshot);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // With empty snapshot, should find no drifts
      expect(result.value.drifts).toHaveLength(0);
      expect(result.value.severity).toBe('none');
    });
  });

  describe('detectDeadCode with graphDeadCodeData', () => {
    it('returns dead code from graph data', async () => {
      const graphDeadCodeData = {
        reachableNodeIds: new Set(['node:index.ts', 'node:main.ts']),
        unreachableNodes: [
          { id: 'node:orphan.ts', type: 'file', name: 'orphan.ts', path: '/src/orphan.ts' },
          {
            id: 'node:unusedHelper',
            type: 'function',
            name: 'unusedHelper',
            path: '/src/utils.ts',
          },
        ],
      };

      const result = await detectDeadCode(emptySnapshot, graphDeadCodeData);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const report = result.value;
      expect(report.deadFiles).toHaveLength(1);
      expect(report.deadFiles[0]!.path).toBe('/src/orphan.ts');
      expect(report.deadExports).toHaveLength(1);
      expect(report.deadExports[0]!.name).toBe('unusedHelper');
      expect(report.deadExports[0]!.type).toBe('function');
    });

    it('without graphDeadCodeData uses existing behavior', async () => {
      const result = await detectDeadCode(emptySnapshot);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // With empty snapshot, should find no dead code
      expect(result.value.deadFiles).toHaveLength(0);
      expect(result.value.deadExports).toHaveLength(0);
    });
  });

  describe('EntropyAnalyzer.analyze with graphOptions', () => {
    it('passes graph options to detectors', async () => {
      const config: EntropyConfig = {
        rootDir: '/tmp/test-graph',
        analyze: {
          drift: true,
          deadCode: true,
        },
        // Use include patterns that match nothing so snapshot build succeeds quickly
        include: [],
      };

      const analyzer = new EntropyAnalyzer(config);

      const graphOptions = {
        graphDriftData: {
          staleEdges: [
            { docNodeId: 'doc:readme.md', codeNodeId: 'code:foo', edgeType: 'references' },
          ],
          missingTargets: ['code:bar'],
        },
        graphDeadCodeData: {
          reachableNodeIds: ['node:entry'],
          unreachableNodes: [
            { id: 'node:dead.ts', type: 'file', name: 'dead.ts', path: '/src/dead.ts' },
          ],
        },
      };

      // With both graphDriftData and graphDeadCodeData provided, analyzer.analyze
      // skips snapshot building entirely and uses graph data for detection
      const result = await analyzer.analyze(graphOptions);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.drift).toBeDefined();
        expect(result.value.drift!.drifts).toHaveLength(2);
        expect(result.value.deadCode).toBeDefined();
        expect(result.value.deadCode!.deadFiles).toHaveLength(1);
        expect(result.value.deadCode!.deadFiles[0]!.path).toBe('/src/dead.ts');
      }
    });

    it('still calls detectors directly with graph data', async () => {
      const graphDriftData = {
        staleEdges: [
          { docNodeId: 'doc:readme.md', codeNodeId: 'code:foo', edgeType: 'references' },
        ],
        missingTargets: ['code:bar'],
      };

      const driftResult = await detectDocDrift(emptySnapshot, {}, graphDriftData);
      expect(driftResult.ok).toBe(true);
      if (driftResult.ok) {
        expect(driftResult.value.drifts).toHaveLength(2);
      }

      const graphDeadCodeData = {
        reachableNodeIds: ['node:entry'] as string[],
        unreachableNodes: [
          { id: 'node:dead.ts', type: 'file', name: 'dead.ts', path: '/src/dead.ts' },
        ],
      };

      const deadCodeResult = await detectDeadCode(emptySnapshot, graphDeadCodeData);
      expect(deadCodeResult.ok).toBe(true);
      if (deadCodeResult.ok) {
        expect(deadCodeResult.value.deadFiles).toHaveLength(1);
      }
    });
  });
});
