import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { BenchmarkRunner } from '../../src/performance/benchmark-runner';

describe('BenchmarkRunner', () => {
  const runner = new BenchmarkRunner();

  describe('discover', () => {
    it('returns empty array when no bench files exist', () => {
      const files = runner.discover('/tmp/nonexistent-dir-xyz');
      expect(files).toEqual([]);
    });

    // #2461: the old substring test turned 'a/**/foo-*.bench.ts' into
    // 'a//foo-.bench.ts', which matched nothing, and shelled out to `find`.
    it('matches a mid-path wildcard glob and skips node_modules', () => {
      const root = mkdtempSync(path.join(tmpdir(), 'bench-discover-'));
      try {
        for (const f of ['a/x.bench.ts', 'a/b/foo-1.bench.ts', 'node_modules/z/foo-2.bench.ts']) {
          mkdirSync(path.join(root, path.dirname(f)), { recursive: true });
          writeFileSync(path.join(root, f), '');
        }
        const rel = (files: string[]) =>
          files.map((f) => path.relative(root, f).replaceAll('\\', '/'));
        expect(rel(runner.discover(root, 'a/**/foo-*.bench.ts'))).toEqual(['a/b/foo-1.bench.ts']);
        expect(rel(runner.discover(root))).toEqual(['a/b/foo-1.bench.ts', 'a/x.bench.ts']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('parseVitestBenchOutput', () => {
    it('returns empty array for empty string', () => {
      const results = runner.parseVitestBenchOutput('');
      expect(results).toEqual([]);
    });

    it('returns empty array for non-JSON output', () => {
      const results = runner.parseVitestBenchOutput('not json at all');
      expect(results).toEqual([]);
    });

    it('parses valid vitest bench JSON output', () => {
      const output = JSON.stringify({
        testResults: [
          {
            name: 'src/utils.bench.ts',
            assertionResults: [
              {
                fullName: 'utils > parse',
                benchmark: {
                  hz: 150000,
                  mean: 0.0000067,
                  p99: 0.00001,
                  rme: 2.5,
                },
              },
            ],
          },
        ],
      });

      const results = runner.parseVitestBenchOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        name: 'utils > parse',
        opsPerSec: 150000,
        marginOfError: 0.025,
      });
      expect(results[0]!.meanMs).toBeCloseTo(0.0067, 3);
      expect(results[0]!.p99Ms).toBeCloseTo(0.01, 3);
    });

    it('handles output with non-JSON preamble', () => {
      const preamble = 'Some vitest output\nmore output\n';
      const json = JSON.stringify({
        testResults: [
          {
            name: 'bench.ts',
            assertionResults: [
              {
                fullName: 'test',
                benchmark: { hz: 1000, mean: 0.001 },
              },
            ],
          },
        ],
      });

      const results = runner.parseVitestBenchOutput(preamble + json);
      expect(results).toHaveLength(1);
      expect(results[0]!.opsPerSec).toBe(1000);
    });

    it('provides defaults for missing benchmark fields', () => {
      const output = JSON.stringify({
        testResults: [
          {
            name: 'test.bench.ts',
            assertionResults: [
              {
                title: 'fallback-name',
                benchmark: { hz: 500 },
              },
            ],
          },
        ],
      });

      const results = runner.parseVitestBenchOutput(output);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        name: 'fallback-name',
        opsPerSec: 500,
        meanMs: 0,
        p99Ms: 0,
        marginOfError: 0.05,
      });
    });
  });

  describe('file path relativization (#2388)', () => {
    const benchJson = (name: string) =>
      JSON.stringify({
        testResults: [{ name, assertionResults: [{ fullName: 'b', benchmark: { hz: 1 } }] }],
      });

    // A project root that is NOT process.cwd(): the MCP server / orchestrator /
    // --cwd case, where the runner is pointed at another project.
    const projectRoot = path.resolve(process.cwd(), '..', 'some-other-project-2388');

    it('relativizes against the given project root, not process.cwd()', () => {
      expect(projectRoot).not.toBe(process.cwd());
      const abs = path.join(projectRoot, 'src', 'utils.bench.ts');
      const results = runner.parseVitestBenchOutput(benchJson(abs), projectRoot);
      expect(results).toHaveLength(1);
      expect(results[0]!.file).toBe('src/utils.bench.ts');
    });

    it('still relativizes against process.cwd() when no project root is given', () => {
      const abs = path.join(process.cwd(), 'pkg', 'a.bench.ts');
      const results = runner.parseVitestBenchOutput(benchJson(abs));
      expect(results[0]!.file).toBe('pkg/a.bench.ts');
    });

    it('leaves already-relative paths unchanged', () => {
      const results = runner.parseVitestBenchOutput(benchJson('src/x.bench.ts'), projectRoot);
      expect(results[0]!.file).toBe('src/x.bench.ts');
    });

    it('does not rewrite files outside the project root into ../ paths', () => {
      const outside = path.resolve(projectRoot, '..', 'elsewhere', 'y.bench.ts');
      const results = runner.parseVitestBenchOutput(benchJson(outside), projectRoot);
      expect(results[0]!.file).toBe(outside);
    });
  });

  describe('run', () => {
    it('handles non-existent directory gracefully', async () => {
      const result = await runner.run({ cwd: '/tmp/nonexistent-bench-dir', timeout: 5000 });
      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
    });
  });
});
