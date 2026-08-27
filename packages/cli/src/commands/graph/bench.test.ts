import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runScan } from './scan.js';
import {
  runGraphBench,
  estimateBenchTokens,
  formatBenchReport,
  benchQueryFor,
  type GraphBenchResult,
} from './bench.js';
import type { BenchJudge, QualityGrade } from './bench-judge.js';

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

  it('reports the answer-quality axis as skipped when no judge is supplied', () => {
    expect(result.answerQuality.status).toBe('skipped');
    expect(result.answerQuality.advisory).toBe(true);
    // Every scenario carries a stable, reviewer-readable query; none is graded.
    for (const s of result.scenarios) {
      expect(typeof s.query).toBe('string');
      expect(s.query.length).toBeGreaterThan(0);
      expect(s.quality).toBeUndefined();
    }
    expect(formatBenchReport(result)).toMatch(/Answer quality.*not run/);
  });
});

describe('benchQueryFor', () => {
  it('phrases structural families and passes NL anchors through', () => {
    expect(benchQueryFor('impact', 'src/a.ts')).toMatch(/impact of changing src\/a\.ts/);
    expect(benchQueryFor('blast-radius', 'src/a.ts')).toMatch(/blast radius of src\/a\.ts/);
    expect(benchQueryFor('dependencies', 'src/a.ts')).toMatch(/depend on/);
    expect(benchQueryFor('outline', 'src/a.ts')).toMatch(/functions, classes, and exports/);
    // find-context / ask anchors are already natural-language queries.
    expect(benchQueryFor('ask', 'What loads the store?')).toBe('What loads the store?');
    expect(benchQueryFor('find-context', 'add a subcommand')).toBe('add a subcommand');
  });
});

describe('runGraphBench answer-quality axis', () => {
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-bench-judge-'));
    const src = path.join(dir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'b.ts'),
      `export const BAR = 42;\nexport function bar() { return BAR; }\n`
    );
    fs.writeFileSync(
      path.join(src, 'a.ts'),
      `import { bar, BAR } from './b.js';\nexport function foo() { return bar() + BAR; }\n`
    );
    await runScan(dir);
  }, 60_000);

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('grades every scenario on both strategies and aggregates when a judge is injected', async () => {
    const calls: Array<{ query: string; strategy: string }> = [];
    // Deterministic mock judge: graph payloads sufficient, naive insufficient.
    const judge: BenchJudge = {
      async grade(query, strategy): Promise<QualityGrade> {
        calls.push({ query, strategy });
        return {
          sufficient: strategy === 'graph',
          confidence: 'high',
          rationale: `mock grade for ${strategy}`,
        };
      },
    };

    const result = await runGraphBench(dir, { top: 1, judge });
    expect(result.ok).toBe(true);
    expect(result.answerQuality.status).toBe('measured');
    // Judge was called twice per scenario (graph + naive) — bench → judge is wired.
    expect(calls.length).toBe(result.scenarios.length * 2);
    // Every scenario carries a per-strategy grade a reviewer can trace.
    for (const s of result.scenarios) {
      expect(s.quality?.graph.sufficient).toBe(true);
      expect(s.quality?.naive.sufficient).toBe(false);
    }
    // Aggregate folds the grades: graph fully sufficient, naive fully insufficient.
    expect(result.answerQuality.graph?.sufficient).toBe(result.scenarios.length);
    expect(result.answerQuality.graph?.sufficientRate).toBe(1);
    expect(result.answerQuality.naive?.insufficient).toBe(result.scenarios.length);
    expect(result.answerQuality.naive?.sufficientRate).toBe(0);
    expect(formatBenchReport(result)).toMatch(/Answer quality.*advisory/s);
  }, 60_000);

  it('folds an inconclusive judge into the axis without faking a score or failing the bench', async () => {
    // A judge that cannot decide (mirrors a provider that rejected every call).
    const inconclusiveJudge: BenchJudge = {
      async grade(): Promise<QualityGrade> {
        return { sufficient: null, confidence: 'low', rationale: 'unreachable' };
      },
    };
    const result = await runGraphBench(dir, { top: 1, judge: inconclusiveJudge });
    // The bench still succeeds — the axis is advisory.
    expect(result.ok).toBe(true);
    expect(result.answerQuality.status).toBe('measured');
    // No fabricated score: every grade is inconclusive, sufficientRate is null.
    expect(result.answerQuality.graph?.inconclusive).toBe(result.scenarios.length);
    expect(result.answerQuality.graph?.sufficientRate).toBeNull();
    expect(result.answerQuality.naive?.sufficientRate).toBeNull();
  }, 60_000);

  it('reports INCONCLUSIVE when a judge was requested but none was reachable', async () => {
    const result = await runGraphBench(dir, { top: 1, judgeRequestedButUnavailable: true });
    expect(result.ok).toBe(true);
    expect(result.answerQuality.status).toBe('inconclusive');
    expect(result.answerQuality.advisory).toBe(true);
    for (const s of result.scenarios) expect(s.quality).toBeUndefined();
    expect(formatBenchReport(result)).toMatch(/INCONCLUSIVE/);
  }, 60_000);
});
