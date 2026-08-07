import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../../src/analysis-provider/interface.js';
import { OutcomeEvaluator, withCanaryRunSignal } from '../../src/outcome-eval/evaluator.js';
import type { CanaryRunOutcome, OutcomeVerdict } from '../../src/outcome-eval/types.js';

function makeCanary(over: Partial<CanaryRunOutcome> = {}): CanaryRunOutcome {
  return {
    exitCode: 1,
    passed: 42,
    failed: 3,
    flaky: 1,
    skipped: 2,
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

/** Provider that always rejects → the evaluator degrades to INCONCLUSIVE/low. */
const rejectingProvider: AnalysisProvider = {
  async analyze() {
    throw new Error('no provider');
  },
};

/** Write a spec markdown to a temp file and return its path. */
function writeSpec(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'canary-eval-'));
  const p = join(dir, 'spec.md');
  writeFileSync(p, body, 'utf-8');
  return p;
}

const SPEC = '# Spec\n## Success Criteria\n1. returns 200\n';

describe('withCanaryRunSignal (pure)', () => {
  it('returns the verdict UNCHANGED (referentially identical) when canaryRun is undefined', () => {
    const v = baseVerdict();
    // Truth 2: absent canaryRun ⇒ same reference, byte-identical to no wiring.
    expect(withCanaryRunSignal(v, undefined)).toBe(v);
  });

  it('appends exactly one deterministic canary line to the rationale when present', () => {
    const v = baseVerdict({ rationale: 'All criteria met.' });
    const out = withCanaryRunSignal(v, makeCanary({ exitCode: 1 }));
    // Truth 3: a NEW object with the line folded in; original untouched.
    expect(out).not.toBe(v);
    expect(out.rationale.startsWith('All criteria met.')).toBe(true);
    expect(out.rationale).toContain(
      'Canary gate: exit 1 (findings); 42 passed, 3 failed, 1 flaky, 2 skipped.'
    );
    // Exactly one canary line appended.
    expect(out.rationale.match(/Canary gate:/g)).toHaveLength(1);
    // Everything except rationale is unchanged.
    expect(out.verdict).toBe(v.verdict);
    expect(out.confidence).toBe(v.confidence);
    expect(out.judgedAgainst).toBe(v.judgedAgainst);
    expect(out.unmetCriteria).toBe(v.unmetCriteria);
    // Truth 6: authority is NEVER touched by the canary signal.
    expect(out.authority).toBe(v.authority);
  });

  it('maps gate exit codes to the clean/findings/surface/abstained labels', () => {
    const v = baseVerdict({ rationale: 'r' });
    expect(withCanaryRunSignal(v, makeCanary({ exitCode: 0 })).rationale).toContain(
      'exit 0 (clean)'
    );
    expect(withCanaryRunSignal(v, makeCanary({ exitCode: 1 })).rationale).toContain(
      'exit 1 (findings)'
    );
    expect(withCanaryRunSignal(v, makeCanary({ exitCode: 2 })).rationale).toContain(
      'exit 2 (surface)'
    );
    expect(withCanaryRunSignal(v, makeCanary({ exitCode: 3 })).rationale).toContain(
      'exit 3 (abstained)'
    );
  });

  it('is deterministic — identical inputs yield an identical rationale', () => {
    const v = baseVerdict({ rationale: 'r' });
    const run = makeCanary();
    expect(withCanaryRunSignal(v, run).rationale).toBe(withCanaryRunSignal(v, run).rationale);
  });

  it('NEVER changes authority regardless of the gate exit code (Truth 6)', () => {
    for (const exitCode of [0, 1, 2, 3, 99]) {
      const v = baseVerdict({ authority: 'blocking' });
      expect(withCanaryRunSignal(v, makeCanary({ exitCode })).authority).toBe('blocking');
    }
  });
});

describe('OutcomeEvaluator canary wiring', () => {
  it('surfaces the canary signal in the verdict rationale on every path (degraded path)', async () => {
    const verdict = await new OutcomeEvaluator(rejectingProvider, new GraphStore()).evaluate({
      specPath: writeSpec(SPEC),
      diff: 'd',
      testOutput: 'ok',
      canaryRun: makeCanary({ exitCode: 2 }),
    });
    expect(verdict.rationale).toContain('Canary gate: exit 2 (surface)');
    // Authority stays TS-derived (INCONCLUSIVE/low ⇒ advisory), never from canary.
    expect(verdict.authority).toBe('advisory');
  });

  it('leaves the rationale byte-identical when no canaryRun is supplied (Truth 5)', async () => {
    const specPath = writeSpec(SPEC);
    const store = new GraphStore();
    const a = await new OutcomeEvaluator(rejectingProvider, store).evaluate({
      specPath,
      diff: 'd',
      testOutput: 'ok',
    });
    const b = await new OutcomeEvaluator(rejectingProvider, new GraphStore()).evaluate({
      specPath,
      diff: 'd',
      testOutput: 'ok',
    });
    // Two no-canary runs are deep-equal (deterministic degraded verdict) and
    // carry no canary line — byte-identical to today's no-canary contract.
    expect(a.rationale).not.toContain('Canary gate');
    expect(a).toEqual(b);
  });

  it('differs from a no-canary run ONLY in the rationale when canaryRun is present', async () => {
    const specPath = writeSpec(SPEC);
    const withRun = await new OutcomeEvaluator(rejectingProvider, new GraphStore()).evaluate({
      specPath,
      diff: 'd',
      testOutput: 'ok',
      canaryRun: makeCanary(),
    });
    const withoutRun = await new OutcomeEvaluator(rejectingProvider, new GraphStore()).evaluate({
      specPath,
      diff: 'd',
      testOutput: 'ok',
    });
    expect(withRun.rationale).not.toBe(withoutRun.rationale);
    expect(withRun.verdict).toBe(withoutRun.verdict);
    expect(withRun.confidence).toBe(withoutRun.confidence);
    expect(withRun.judgedAgainst).toBe(withoutRun.judgedAgainst);
    expect(withRun.unmetCriteria).toEqual(withoutRun.unmetCriteria);
    expect(withRun.authority).toBe(withoutRun.authority);
  });
});

describe('OutcomeEvaluator canary node metadata (Truth 4)', () => {
  it('stamps additive canary* metadata on the execution_outcome node when present', async () => {
    const store = new GraphStore();
    await new OutcomeEvaluator(rejectingProvider, store).evaluate({
      specPath: writeSpec(SPEC),
      diff: 'd',
      testOutput: 'ok',
      canaryRun: makeCanary({ exitCode: 3, passed: 10, failed: 0, flaky: 4, skipped: 5 }),
    });
    const node = store.findNodes({ type: 'execution_outcome' })[0];
    expect(node.metadata.canaryGateExitCode).toBe(3);
    expect(node.metadata.canaryPassed).toBe(10);
    expect(node.metadata.canaryFailed).toBe(0);
    expect(node.metadata.canaryFlaky).toBe(4);
    expect(node.metadata.canarySkipped).toBe(5);
    // Authority on the node stays TS-derived (advisory on the degraded path).
    expect(node.metadata.authority).toBe('advisory');
  });

  it('emits ZERO canary* keys on the node when canaryRun is absent (byte-identical)', async () => {
    const store = new GraphStore();
    await new OutcomeEvaluator(rejectingProvider, store).evaluate({
      specPath: writeSpec(SPEC),
      diff: 'd',
      testOutput: 'ok',
    });
    const node = store.findNodes({ type: 'execution_outcome' })[0];
    for (const key of [
      'canaryGateExitCode',
      'canaryPassed',
      'canaryFailed',
      'canaryFlaky',
      'canarySkipped',
    ]) {
      expect(key in node.metadata).toBe(false);
    }
  });
});
