import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../../src/analysis-provider/interface.js';
import { OutcomeEvaluator, withGuardianSignal } from '../../src/outcome-eval/evaluator.js';
import type { OutcomeVerdict } from '../../src/outcome-eval/types.js';
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION } from '../../src/guardian/index.js';
import type { GuardianAnalysis } from '../../src/guardian/index.js';

function makeGuardian(over: Partial<GuardianAnalysis> = {}): GuardianAnalysis {
  return {
    schema: GUARDIAN_ANALYSIS_SCHEMA,
    version: GUARDIAN_ANALYSIS_VERSION,
    generatedAt: '2026-07-19T00:00:00.000Z',
    verdict: 'fail',
    severity: 'error',
    coverageDelta: -4.2,
    files: [{ file: 'src/a.ts', uncoveredLines: [10, 11] }],
    ...over,
  };
}

function baseVerdict(over: Partial<OutcomeVerdict> = {}): OutcomeVerdict {
  return {
    verdict: 'SATISFIED',
    confidence: 'high',
    rationale: 'All criteria met.',
    judgedAgainst: 'success-criteria',
    unmetCriteria: [],
    authority: 'advisory',
    ...over,
  };
}

/** Provider that always rejects → the evaluator degrades to INCONCLUSIVE. */
const rejectingProvider: AnalysisProvider = {
  async analyze() {
    throw new Error('no provider');
  },
};

/** Write a spec markdown to a temp file and return its path. */
function writeSpec(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'guardian-eval-'));
  const p = join(dir, 'spec.md');
  writeFileSync(p, body, 'utf-8');
  return p;
}

describe('withGuardianSignal (pure)', () => {
  it('returns the verdict UNCHANGED when guardian is undefined', () => {
    const v = baseVerdict();
    expect(withGuardianSignal(v, undefined)).toBe(v);
  });

  it('returns the verdict UNCHANGED when guardian is empty', () => {
    const v = baseVerdict();
    expect(withGuardianSignal(v, [])).toBe(v);
  });

  it('appends a deterministic guardian line to the rationale when present', () => {
    const v = baseVerdict({ rationale: 'All criteria met.' });
    const out = withGuardianSignal(v, [makeGuardian()]);
    expect(out).not.toBe(v);
    expect(out.rationale.startsWith('All criteria met.')).toBe(true);
    expect(out.rationale).toContain('Guardian diff-coverage: FAIL');
    // Authority is never touched by the guardian signal.
    expect(out.authority).toBe(v.authority);
    expect(out.verdict).toBe(v.verdict);
  });
});

describe('OutcomeEvaluator guardian wiring', () => {
  it('surfaces the guardian signal in the verdict rationale', async () => {
    const evaluator = new OutcomeEvaluator(rejectingProvider, new GraphStore());
    const verdict = await evaluator.evaluate({
      specPath: writeSpec('# Spec\n## Success Criteria\n1. returns 200\n'),
      diff: 'diff --git a/x b/x',
      testOutput: 'ok',
      guardian: [makeGuardian()],
    });
    expect(verdict.rationale).toContain('Guardian diff-coverage: FAIL');
  });

  it('leaves the rationale byte-identical when no guardian is supplied', async () => {
    const specPath = writeSpec('# Spec\n## Success Criteria\n1. returns 200\n');
    const withoutGuardian = await new OutcomeEvaluator(
      rejectingProvider,
      new GraphStore()
    ).evaluate({ specPath, diff: 'd', testOutput: 'ok' });
    expect(withoutGuardian.rationale).not.toContain('Guardian diff-coverage');
  });
});
