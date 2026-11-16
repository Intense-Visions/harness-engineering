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

    // #2327: an empty set over a project is NO SIGNAL, not a clean zero.
    it('abstains with a reason when the set is empty and graph inference did not run', async () => {
      writeFile('src/plain.ts', `export function noAnnotation() {\n  return 42;\n}\n`);

      const result = await new CriticalPathResolver(tmpDir).resolve();

      expect(result.graphInference.status).toBe('not-run');
      expect(result.graphInference.reason).toMatch(/fan-in/);
      expect(result.noSignal).toBeDefined();
      expect(result.noSignal?.reason).toMatch(/graph inference did not run/);
    });

    it('abstains even when graph inference ran but found nothing', async () => {
      const result = await new CriticalPathResolver(tmpDir).resolve({ highFanInFunctions: [] });

      expect(result.graphInference).toEqual({ status: 'ran' });
      expect(result.noSignal?.reason).toMatch(/no high-fan-in functions/);
    });

    it('carries no abstention marker when the set is non-empty', async () => {
      writeFile('src/core.ts', `// @perf-critical\nexport function hot() {}\n`);

      const result = await new CriticalPathResolver(tmpDir).resolve();

      expect(result.entries).toHaveLength(1);
      expect(result.noSignal).toBeUndefined();
      // Inference still reports that it never ran, so a consumer can tell the
      // set is annotation-only rather than annotation + graph.
      expect(result.graphInference.status).toBe('not-run');
    });

    it('reports graph inference as ran when graph data is supplied', async () => {
      const result = await new CriticalPathResolver(tmpDir).resolve({
        highFanInFunctions: [{ file: 'src/hub.ts', function: 'route', fanIn: 40 }],
      });

      expect(result.graphInference).toEqual({ status: 'ran' });
      expect(result.noSignal).toBeUndefined();
    });
  });

  // #2256: every annotated path in this repo resolved into test/fixture code.
  describe('test and fixture exclusion', () => {
    const annotated = (name: string) => `/** @perf-critical */\nexport function ${name}() {}\n`;

    it('ignores annotations in test, spec, and bench files', async () => {
      writeFile('src/core.test.ts', annotated('inTest'));
      writeFile('src/core.spec.tsx', annotated('inSpec'));
      writeFile('src/core.bench.ts', annotated('inBench'));
      writeFile('src/core.ts', annotated('real'));

      const result = await new CriticalPathResolver(tmpDir).resolve();

      expect(result.entries.map((e) => e.function)).toEqual(['real']);
    });

    it('ignores annotations under test and fixture directories', async () => {
      writeFile('tests/helpers.ts', annotated('inTests'));
      writeFile('packages/a/test/util.ts', annotated('inTestDir'));
      writeFile('src/__tests__/x.ts', annotated('inDunderTests'));
      writeFile('src/__fixtures__/x.ts', annotated('inDunderFixtures'));
      writeFile('src/fixtures/x.ts', annotated('inFixtures'));
      writeFile('src/__mocks__/x.ts', annotated('inMocks'));
      writeFile('packages/a/src/hot.ts', annotated('real'));

      const result = await new CriticalPathResolver(tmpDir).resolve();

      expect(result.entries).toEqual([
        { file: 'packages/a/src/hot.ts', function: 'real', source: 'annotation' },
      ]);
    });

    it('ignores the marker when it appears in code rather than a comment', async () => {
      // The resolver's own source mentions the marker in a string literal and
      // was registering the next declaration (`fnName`) as a critical path.
      writeFile(
        'src/scanner.ts',
        [
          "if (!line.includes('@perf-critical')) skip();",
          'const fnName = resolve();',
          'const marker = "@perf-critical";',
          'export function notCritical() {}',
          '',
        ].join('\n')
      );

      const result = await new CriticalPathResolver(tmpDir).resolve();

      expect(result.entries).toEqual([]);
    });
  });
});
