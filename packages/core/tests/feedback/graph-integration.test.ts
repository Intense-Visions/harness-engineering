import { describe, it, expect } from 'vitest';
import { analyzeDiff, parseDiff, createSelfReview, ChecklistBuilder } from '../../src/feedback';
import type { GraphImpactData, GraphHarnessCheckData } from '../../src/feedback/types';

const sampleDiff = `diff --git a/src/api/handler.ts b/src/api/handler.ts
new file mode 100644
--- /dev/null
+++ b/src/api/handler.ts
@@ -0,0 +1,10 @@
+export function handleRequest() {}
diff --git a/src/domain/user.ts b/src/domain/user.ts
--- a/src/domain/user.ts
+++ b/src/domain/user.ts
@@ -1,3 +1,5 @@
+import { validate } from './validate';
 export function getUser() {}`;

const mockImpactData: GraphImpactData = {
  affectedTests: [{ testFile: 'tests/api/handler.test.ts', coversFile: 'src/api/handler.ts' }],
  affectedDocs: [{ docFile: 'docs/api.md', documentsFile: 'src/domain/user.ts' }],
  impactScope: 5,
};

const mockHarnessData: GraphHarnessCheckData = {
  graphExists: true,
  nodeCount: 42,
  edgeCount: 88,
  constraintViolations: 0,
  undocumentedFiles: 3,
  unreachableNodes: 1,
};

describe('feedback graph-integration', () => {
  describe('analyzeDiff with graphImpactData', () => {
    it('uses graph for test coverage when graph data provided', async () => {
      const parseResult = parseDiff(sampleDiff);
      expect(parseResult.ok).toBe(true);
      if (!parseResult.ok) return;

      const result = await analyzeDiff(
        parseResult.value,
        { enabled: true, checkTestCoverage: true },
        mockImpactData
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // handler.ts is covered by graph data, so no test coverage warning for it
      const testItems = result.value.filter((i) => i.check.includes('Test coverage'));
      expect(testItems.every((i) => !i.details.includes('handler.ts'))).toBe(true);
    });

    it('falls back to filename matching without graph data', async () => {
      const parseResult = parseDiff(sampleDiff);
      if (!parseResult.ok) return;

      const result = await analyzeDiff(parseResult.value, {
        enabled: true,
        checkTestCoverage: true,
      });

      expect(result.ok).toBe(true);
    });

    it('flags broad impact scope', async () => {
      const parseResult = parseDiff(sampleDiff);
      if (!parseResult.ok) return;

      const broadImpact: GraphImpactData = {
        ...mockImpactData,
        impactScope: 25,
      };

      const result = await analyzeDiff(parseResult.value, { enabled: true }, broadImpact);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const scopeItem = result.value.find((i) => i.id === 'impact-scope');
      expect(scopeItem).toBeDefined();
      expect(scopeItem!.severity).toBe('warning');
    });
  });

  describe('ChecklistBuilder with graph data', () => {
    it('returns real check results with graph data', async () => {
      const parseResult = parseDiff(sampleDiff);
      if (!parseResult.ok) return;

      const builder = new ChecklistBuilder('/tmp');
      builder.withHarnessChecks(
        { context: true, constraints: true, entropy: true },
        mockHarnessData
      );
      const result = await builder.run(parseResult.value);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const contextItem = result.value.items.find((i) => i.id === 'harness-context');
      expect(contextItem).toBeDefined();
      expect(contextItem!.passed).toBe(true);
      expect(contextItem!.details).toContain('42 nodes');

      const constraintItem = result.value.items.find((i) => i.id === 'harness-constraints');
      expect(constraintItem).toBeDefined();
      expect(constraintItem!.passed).toBe(true);

      const entropyItem = result.value.items.find((i) => i.id === 'harness-entropy');
      expect(entropyItem).toBeDefined();
      expect(entropyItem!.passed).toBe(false); // has unreachable + undocumented
      expect(entropyItem!.details).toContain('1 unreachable');
    });

    it('returns placeholders without graph data', async () => {
      const parseResult = parseDiff(sampleDiff);
      if (!parseResult.ok) return;

      const builder = new ChecklistBuilder('/tmp');
      builder.withHarnessChecks({ context: true });
      const result = await builder.run(parseResult.value);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const contextItem = result.value.items.find((i) => i.id === 'harness-context');
      expect(contextItem).toBeDefined();
      expect(contextItem!.passed).toBe(true); // placeholder always passes
    });
  });

  describe('createSelfReview with graph data', () => {
    it('passes graph data through to builder and analyzer', async () => {
      const parseResult = parseDiff(sampleDiff);
      if (!parseResult.ok) return;

      const result = await createSelfReview(
        parseResult.value,
        {
          rootDir: '/tmp',
          harness: { context: true, constraints: true, entropy: true },
          diffAnalysis: { enabled: true, checkTestCoverage: true },
        },
        { impact: mockImpactData, harness: mockHarnessData }
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Should have harness items with real data (not placeholders)
      const contextItem = result.value.items.find((i) => i.id === 'harness-context');
      expect(contextItem!.details).toContain('42 nodes');
    });
  });
});
