import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTestCraft } from '../../src/test-craft';
import {
  toTestVerdicts,
  buildTestCraftReport,
  TEST_CRAFT_REPORT_SCHEMA,
  TEST_CRAFT_REPORT_VERSION,
  type TestCraftReport,
} from '../../src/test-craft/emit';
import type { TestCraftOutput, TestFinding } from '../../src/test-craft/findings/schema';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

function finding(over: Partial<TestFinding> & { target: TestFinding['target'] }): TestFinding {
  return {
    code: 'TEST-R001',
    phase: 'critique',
    tier: 'polish',
    impact: 'small',
    confidence: 'medium',
    message: 'x',
    cite: { rubricId: 'TEST-R001', source: 'seed' },
    derived: { priority: 1 },
    ...over,
  };
}

const targetA: TestFinding['target'] = {
  file: 'src/foo.test.ts',
  line: 3,
  testName: 'returns null',
  nesting: ['foo'],
  framework: 'vitest',
};
const targetB: TestFinding['target'] = {
  file: 'src/bar.test.ts',
  line: 9,
  testName: 'adds',
  nesting: [],
  framework: 'vitest',
};

function outputWith(findings: TestFinding[]): TestCraftOutput {
  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: 1,
      llmCalls: { provider: 'mock', model: 'mock', count: 0, costUsd: 0 },
      catalog: { rubricsApplied: [] },
      counts: { filesScanned: 1, testsExtracted: 1, testsSkippedOrTodo: 0, sourcePaired: 0 },
      frameworksDetected: {
        vitest: 1,
        jest: 0,
        mocha: 0,
        playwright: 0,
        pytest: 0,
        unknown: 0,
      },
      runId: 'run-123',
    },
  };
}

describe('toTestVerdicts', () => {
  it('rolls multiple rubric findings on one test into a single verdict', () => {
    const out = outputWith([
      finding({ target: targetA, tier: 'polish', code: 'TEST-R001' }),
      finding({ target: targetA, tier: 'aspirational', code: 'TEST-R002' }),
    ]);
    const verdicts = toTestVerdicts(out);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.findingCount).toBe(2);
    expect(verdicts[0]!.target.testName).toBe('returns null');
  });

  it('worstTier picks the most severe tier and drives promotability', () => {
    const foundational = toTestVerdicts(
      outputWith([
        finding({ target: targetA, tier: 'aspirational' }),
        finding({ target: targetA, tier: 'foundational' }),
      ])
    );
    expect(foundational[0]!.worstTier).toBe('foundational');
    expect(foundational[0]!.promotable).toBe(false);

    const polishOnly = toTestVerdicts(outputWith([finding({ target: targetB, tier: 'polish' })]));
    expect(polishOnly[0]!.worstTier).toBe('polish');
    expect(polishOnly[0]!.promotable).toBe(true);
  });

  it('keeps distinct tests as separate verdicts', () => {
    const verdicts = toTestVerdicts(
      outputWith([finding({ target: targetA }), finding({ target: targetB })])
    );
    expect(verdicts).toHaveLength(2);
  });
});

describe('buildTestCraftReport', () => {
  it('produces a self-describing document keyed to the run', () => {
    const report = buildTestCraftReport(outputWith([finding({ target: targetA })]));
    expect(report.schema).toBe(TEST_CRAFT_REPORT_SCHEMA);
    expect(report.version).toBe(TEST_CRAFT_REPORT_VERSION);
    expect(report.runId).toBe('run-123');
    expect(report.verdicts).toHaveLength(1);
    expect(typeof report.generatedAt).toBe('string');
  });
});

describe('runTestCraft emitTo (issue #914)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-craft-emit-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a machine-readable per-test verdict report to the emit path', async () => {
    const testFile = path.join(tmpDir, 'src', 'foo.test.ts');
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, `it('works', () => {});`);

    const provider = new MockLlmProvider([
      {
        promptIncludes: 'works',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"no assertion"}\n```',
      },
    ]);

    const emitPath = path.join(tmpDir, '.harness', 'analyses', 'test-craft.json');
    const out = await runTestCraft({
      path: tmpDir,
      __testProvider: provider,
      emitTo: emitPath,
    });

    // The chat return is unchanged...
    expect(out.findings.length).toBeGreaterThanOrEqual(1);

    // ...but the machine-readable report is now on disk for downstream tooling.
    expect(fs.existsSync(emitPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(emitPath, 'utf-8')) as TestCraftReport;
    expect(report.schema).toBe(TEST_CRAFT_REPORT_SCHEMA);
    expect(report.version).toBe(TEST_CRAFT_REPORT_VERSION);
    expect(report.runId).toBe(out.summary.runId);
    expect(report.verdicts.length).toBeGreaterThanOrEqual(1);

    const verdict = report.verdicts.find((v) => v.target.testName === 'works');
    expect(verdict).toBeDefined();
    expect(verdict!.worstTier).toBe('foundational');
    expect(verdict!.promotable).toBe(false);
    expect(verdict!.findings.length).toBe(verdict!.findingCount);
  });

  it('resolves a relative emit path against the project root', async () => {
    const testFile = path.join(tmpDir, 'src', 'foo.test.ts');
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, `it('works', () => {});`);

    const provider = new MockLlmProvider([
      {
        promptIncludes: 'works',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"low","message":"ok"}\n```',
      },
    ]);

    await runTestCraft({
      path: tmpDir,
      __testProvider: provider,
      emitTo: 'report.json',
    });

    expect(fs.existsSync(path.join(tmpDir, 'report.json'))).toBe(true);
  });

  it('does not write a report when emitTo is unset', async () => {
    const testFile = path.join(tmpDir, 'src', 'foo.test.ts');
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, `it('works', () => {});`);

    await runTestCraft({ path: tmpDir, __testProvider: new MockLlmProvider() });
    expect(fs.readdirSync(tmpDir)).not.toContain('report.json');
  });
});
