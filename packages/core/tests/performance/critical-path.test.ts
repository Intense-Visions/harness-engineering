import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CriticalPathResolver } from '../../src/performance/critical-path';
import type { GraphCriticalPathData } from '../../src/performance/critical-path';

describe('CriticalPathResolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'critical-path-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  describe('annotation scanning', () => {
    it('finds @perf-critical in JSDoc annotations', async () => {
      writeFile(
        'src/core.ts',
        `/** @perf-critical */
export function processData(input: string): string {
  return input.trim();
}
`
      );

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        file: 'src/core.ts',
        function: 'processData',
        source: 'annotation',
      });
      expect(result.stats.annotated).toBe(1);
      expect(result.stats.total).toBe(1);
    });

    it('finds @perf-critical in line comments', async () => {
      writeFile(
        'src/utils.ts',
        `// @perf-critical
export async function fetchData(url: string) {
  return fetch(url);
}
`
      );

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        file: 'src/utils.ts',
        function: 'fetchData',
        source: 'annotation',
      });
    });

    it('finds @perf-critical for const arrow functions', async () => {
      writeFile(
        'src/handler.ts',
        `/** @perf-critical */
export const handleRequest = async (req: Request) => {
  return new Response('ok');
};
`
      );

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        file: 'src/handler.ts',
        function: 'handleRequest',
        source: 'annotation',
      });
    });

    it('skips node_modules, dist, and .git directories', async () => {
      writeFile(
        'node_modules/dep/index.ts',
        `/** @perf-critical */
export function depFunc() {}
`
      );
      writeFile(
        'dist/output.ts',
        `/** @perf-critical */
export function distFunc() {}
`
      );
      writeFile(
        '.git/hooks/pre-commit.ts',
        `/** @perf-critical */
export function hookFunc() {}
`
      );
      writeFile(
        'src/real.ts',
        `/** @perf-critical */
export function realFunc() {}
`
      );

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve();

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].function).toBe('realFunc');
    });
  });

  describe('graph data merging', () => {
    it('merges graph data with annotations', async () => {
      writeFile(
        'src/core.ts',
        `/** @perf-critical */
export function annotatedFunc() {}
`
      );

      const graphData: GraphCriticalPathData = {
        highFanInFunctions: [{ file: 'src/utils.ts', function: 'helperFunc', fanIn: 15 }],
      };

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve(graphData);

      expect(result.entries).toHaveLength(2);

      const annotated = result.entries.find((e) => e.source === 'annotation');
      expect(annotated).toEqual({
        file: 'src/core.ts',
        function: 'annotatedFunc',
        source: 'annotation',
      });

      const graphInferred = result.entries.find((e) => e.source === 'graph-inferred');
      expect(graphInferred).toEqual({
        file: 'src/utils.ts',
        function: 'helperFunc',
        source: 'graph-inferred',
        fanIn: 15,
      });

      expect(result.stats.annotated).toBe(1);
      expect(result.stats.graphInferred).toBe(1);
      expect(result.stats.total).toBe(2);
    });

    it('deduplicates entries from both sources (annotation wins)', async () => {
      writeFile(
        'src/core.ts',
        `/** @perf-critical */
export function sharedFunc() {}
`
      );

      const graphData: GraphCriticalPathData = {
        highFanInFunctions: [{ file: 'src/core.ts', function: 'sharedFunc', fanIn: 10 }],
      };

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve(graphData);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        file: 'src/core.ts',
        function: 'sharedFunc',
        source: 'annotation',
      });
      expect(result.stats.annotated).toBe(1);
      expect(result.stats.graphInferred).toBe(0);
      expect(result.stats.total).toBe(1);
    });
  });

  describe('empty results', () => {
    it('returns empty set when no annotations and no graph data', async () => {
      writeFile(
        'src/plain.ts',
        `export function noAnnotation() {
  return 42;
}
`
      );

      const resolver = new CriticalPathResolver(tmpDir);
      const result = await resolver.resolve();

      expect(result.entries).toHaveLength(0);
      expect(result.stats).toEqual({
        annotated: 0,
        graphInferred: 0,
        total: 0,
      });
    });
  });
});
