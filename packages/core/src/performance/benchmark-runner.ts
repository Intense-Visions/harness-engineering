import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { globSync } from 'glob';
import type { BenchmarkResult } from './types';

export interface BenchmarkRunOptions {
  glob?: string;
  cwd?: string;
  timeout?: number;
}

export class BenchmarkRunner {
  /**
   * Discover .bench.ts files matching the glob pattern (relative to `cwd`).
   *
   * A real glob match in Node, not `find` plus a substring test: the substring
   * test silently matched nothing for any glob with a mid-path wildcard, and
   * `find` does not exist on Windows (#2461). Returns absolute paths.
   */
  discover(cwd: string, glob?: string): string[] {
    try {
      return globSync(glob ?? '**/*.bench.ts', {
        cwd,
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/dist/**'],
      }).sort();
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

      const results = this.parseVitestBenchOutput(rawOutput, cwd);
      return { results, rawOutput, success: true };
    } catch (error: unknown) {
      // vitest bench may exit non-zero but still produce output
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const output = err.stdout || err.message || '';
      const results = this.parseVitestBenchOutput(output, cwd);
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
    file: string,
    projectRoot: string
  ): BenchmarkResult | null {
    if (!assertion.benchmark) return null;
    const bench = assertion.benchmark;
    return {
      name: assertion.fullName || assertion.title || 'unknown',
      file: relativizeToRoot(file, projectRoot),
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
    }>,
    projectRoot: string
  ): BenchmarkResult[] {
    const results: BenchmarkResult[] = [];
    for (const testResult of testResults) {
      const file = testResult.name || testResult.filepath || '';
      const assertions = testResult.assertionResults ?? [];
      for (const assertion of assertions) {
        const result = this.parseBenchAssertion(assertion, file, projectRoot);
        if (result) results.push(result);
      }
    }
    return results;
  }

  /**
   * @param projectRoot - Root that absolute benchmark file paths are made
   *   relative to (the directory vitest ran in). Defaults to `process.cwd()`.
   */
  parseVitestBenchOutput(output: string, projectRoot: string = process.cwd()): BenchmarkResult[] {
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

      return this.collectAssertionResults(testResults, projectRoot);
    } catch {
      return [];
    }
  }
}

/**
 * Make an absolute benchmark file path relative to `projectRoot`, using `/`
 * separators so baseline keys match across machines and platforms. Paths that
 * are already relative, or that fall outside `projectRoot`, are returned as-is.
 */
function relativizeToRoot(file: string, projectRoot: string): string {
  if (!file || !path.isAbsolute(file)) return file;
  const rel = path.relative(projectRoot, file).replaceAll('\\', '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return file;
  return rel;
}
