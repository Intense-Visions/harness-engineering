import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../../src/performance/benchmark-runner';

describe('BenchmarkRunner', () => {
  const runner = new BenchmarkRunner();

  describe('discover', () => {
    it('returns empty array when no bench files exist', () => {
      const files = runner.discover('/tmp/nonexistent-dir-xyz');
      expect(files).toEqual([]);
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

  describe('run', () => {
    it('handles non-existent directory gracefully', async () => {
      const result = await runner.run({ cwd: '/tmp/nonexistent-bench-dir', timeout: 5000 });
      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
    });
  });
});
