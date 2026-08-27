import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runScan } from './scan.js';
import {
  runGraphBench,
  estimateBenchTokens,
  formatBenchReport,
  type GraphBenchResult,
} from './bench.js';

describe('estimateBenchTokens', () => {
  it('mirrors the chars/4 estimator', () => {
    expect(estimateBenchTokens('')).toBe(0);
    expect(estimateBenchTokens('abcd')).toBe(1);
    expect(estimateBenchTokens('abcde')).toBe(2); // ceil(5/4)
  });
});

describe('runGraphBench abstention', () => {
  it('abstains with a scan instruction when no graph exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-bench-nograph-'));
    try {
      const result = await runGraphBench(dir);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/graph scan/i);
      expect(result.scenarios).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runGraphBench on a fixture graph', () => {
  let dir: string;
  let result: GraphBenchResult;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-bench-'));
    const src = path.join(dir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'b.ts'),
      `export function bar(x: number): number {\n  return x * 2;\n}\n\nexport const BAR_CONST = 42;\n`
    );
    fs.writeFileSync(
      path.join(src, 'a.ts'),
      `import { bar, BAR_CONST } from './b.js';\n\nexport function foo(n: number): number {\n  // a deliberately longer body so the full file dwarfs its outline skeleton\n  let total = 0;\n  for (let i = 0; i < n; i++) {\n    total += bar(i) + BAR_CONST;\n  }\n  return total;\n}\n\nexport function fooTwice(n: number): number {\n  return foo(n) + foo(n);\n}\n`
    );
    fs.writeFileSync(
      path.join(src, 'c.ts'),
      `import { foo, fooTwice } from './a.js';\nimport { bar } from './b.js';\n\nexport function baz(): number {\n  return foo(3) + fooTwice(2) + bar(1);\n}\n`
    );
    await runScan(dir);
    result = await runGraphBench(dir, { top: 2 });
  }, 60_000);

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs both strategies and computes an overall ratio', () => {
    expect(result.ok).toBe(true);
    expect(result.scenarios.length).toBeGreaterThan(0);
    expect(result.families.length).toBeGreaterThan(0);
    // Both strategies actually produced measured context.
    expect(result.overall.graph.tokens).toBeGreaterThan(0);
    expect(result.overall.naive.tokens).toBeGreaterThan(0);
  });

  it('measures every scenario on both strategies with the identical estimator', () => {
    for (const s of result.scenarios) {
      expect(s.graph.tokens).toBeGreaterThanOrEqual(0);
      expect(s.naive.toolCalls).toBeGreaterThanOrEqual(1);
    }
  });

  it('shows the outline family reads strictly fewer tokens via the graph than a full-file read', () => {
    const outline = result.families.find((f) => f.family === 'outline');
    expect(outline).toBeDefined();
    // code_outline returns a signature skeleton; the naive baseline reads the whole file.
    expect(outline!.naive.tokens).toBeGreaterThan(outline!.graph.tokens);
    expect(outline!.tokenSavings).toBeGreaterThan(1);
  });

  it('records the honest comparator target, not the flattering README figure', () => {
    expect(result.comparator.tokenSavings).toBe(10);
    expect(result.comparator.note).toMatch(/NOT the 99\.2%/);
  });

  it('renders a human-readable report', () => {
    const report = formatBenchReport(result);
    expect(report).toMatch(/issue #1271/);
    expect(report).toMatch(/OVERALL/);
  });
});
