import { execFileSync } from 'node:child_process';
import type { BenchmarkResult } from './types';

export interface BenchmarkRunOptions {
  glob?: string;
  cwd?: string;
  timeout?: number;
}

export class BenchmarkRunner {
  /**
   * Discover .bench.ts files matching the glob pattern.
   */
  discover(cwd: string, glob?: string): string[] {
    try {
      // Use execFileSync to avoid shell injection via cwd
      const result = execFileSync(
        'find',
        [
          cwd,
          '-name',
          '*.bench.ts',
          '-not',
          '-path',
          '*/node_modules/*',
          '-not',
          '-path',
          '*/dist/*',
        ],
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (!result) return [];
      const files = result.split('\n').filter(Boolean);
      if (glob && glob !== '**/*.bench.ts') {
        // Filter by glob pattern — simple substring match for practical use
        return files.filter((f) => f.includes(glob.replace(/\*/g, '')));
      }
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Run benchmarks via vitest bench and capture results.
   * Returns parsed BenchmarkResult[] from vitest bench JSON output.
   */
  async run(options: BenchmarkRunOptions = {}): Promise<{
    results: BenchmarkResult[];
    rawOutput: string;
    success: boolean;
  }> {
    const cwd = options.cwd ?? process.cwd();
    const timeout = options.timeout ?? 120000;
    const glob = options.glob;

    // Build the vitest bench command
    const args = ['vitest', 'bench', '--run'];
    if (glob) {
      args.push(glob);
    }
    args.push('--reporter=json');

    try {
      const rawOutput = execFileSync('npx', args, {
        cwd,
        encoding: 'utf-8',
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const results = this.parseVitestBenchOutput(rawOutput);
      return { results, rawOutput, success: true };
    } catch (error: unknown) {
      // vitest bench may exit non-zero but still produce output
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const output = err.stdout || err.message || '';
      const results = this.parseVitestBenchOutput(output);
      return {
        results,
        rawOutput: output,
        success: results.length > 0,
      };
    }
  }

  /**
   * Extract a BenchmarkResult from a single assertion with benchmark data.
   */
  private parseBenchAssertion(
    assertion: { benchmark?: Record<string, number>; fullName?: string; title?: string },
    file: string
  ): BenchmarkResult | null {
    if (!assertion.benchmark) return null;
    const bench = assertion.benchmark;
    return {
      name: assertion.fullName || assertion.title || 'unknown',
      file: file.replace(process.cwd() + '/', ''),
      opsPerSec: Math.round(bench.hz || 0),
      meanMs: bench.mean ? bench.mean * 1000 : 0,
      p99Ms: bench.p99 ? bench.p99 * 1000 : bench.mean ? bench.mean * 1000 * 1.5 : 0,
      marginOfError: bench.rme ? bench.rme / 100 : 0.05,
    };
  }

  /**
   * Extract JSON from output that may contain non-JSON preamble.
   */
  private extractJson(output: string): unknown {
    const jsonStart = output.indexOf('{');
    const jsonEnd = output.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;
    return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
  }

  /**
   * Parse vitest bench JSON reporter output into BenchmarkResult[].
   * Vitest bench JSON output contains testResults with benchmark data.
   */
  private collectAssertionResults(
    testResults: Array<{
      name?: string;
      filepath?: string;
      assertionResults?: Array<{
        benchmark?: Record<string, number>;
        fullName?: string;
        title?: string;
      }>;
    }>
  ): BenchmarkResult[] {
    const results: BenchmarkResult[] = [];
    for (const testResult of testResults) {
      const file = testResult.name || testResult.filepath || '';
      const assertions = testResult.assertionResults ?? [];
      for (const assertion of assertions) {
        const result = this.parseBenchAssertion(assertion, file);
        if (result) results.push(result);
      }
    }
    return results;
  }

  parseVitestBenchOutput(output: string): BenchmarkResult[] {
    try {
      const parsed = this.extractJson(output) as Record<string, unknown> | null;
      if (!parsed) return [];

      const testResults = parsed.testResults as Array<{
        name?: string;
        filepath?: string;
        assertionResults?: Array<{
          benchmark?: Record<string, number>;
          fullName?: string;
          title?: string;
        }>;
      }>;
      if (!testResults) return [];

      return this.collectAssertionResults(testResults);
    } catch {
      return [];
    }
  }
}
