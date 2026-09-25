import { describe, it, expect } from 'vitest';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';
import {
  type QualityVerdict,
  cleanVerdict,
  defectVerdict,
  failSafeVerdict,
  unjudgedVerdict,
  afterCleanSecurityScan,
  describeVerdict,
  outcomeVerdictToQualityVerdict,
  qualityVerdictLogFields,
  toOutcomeClass,
} from './quality-verdict-kind';

/**
 * Discriminated quality verdicts (#2221 prerequisite 1). These tests pin TWO things:
 *  1. the collapse `toOutcomeClass` is EXACTLY today's two-valued escalation behavior
 *     (table-driven over every variant — the invariant is machine-checked, not argued);
 *  2. the discrimination itself carries the information the collapse throws away.
 */

/** Every inhabited variant of the union, with the outcome class it must collapse to. */
const COLLAPSE_TABLE: Array<{ verdict: QualityVerdict; outcomeClass: 'quality-fail' | undefined }> =
  [
    { verdict: { kind: 'defect', source: 'security' }, outcomeClass: 'quality-fail' },
    { verdict: { kind: 'defect', source: 'acceptance-eval' }, outcomeClass: 'quality-fail' },
    { verdict: { kind: 'defect', source: 'retrospective' }, outcomeClass: 'quality-fail' },
    { verdict: { kind: 'clean', source: 'security' }, outcomeClass: undefined },
    { verdict: { kind: 'clean', source: 'acceptance-eval' }, outcomeClass: undefined },
    { verdict: { kind: 'clean', source: 'retrospective' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'router-off' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'empty-diff' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'triage-off' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'no-external-id' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'no-record' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'eval-declined' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'store-unreadable' }, outcomeClass: undefined },
    { verdict: { kind: 'unjudged', reason: 'internal-error' }, outcomeClass: undefined },
    { verdict: { kind: 'fail-safe', reason: 'store-unreadable' }, outcomeClass: 'quality-fail' },
    {
      verdict: { kind: 'fail-safe', reason: 'prediction-unparseable' },
      outcomeClass: 'quality-fail',
    },
    { verdict: { kind: 'fail-safe', reason: 'internal-error' }, outcomeClass: 'quality-fail' },
  ];

describe('toOutcomeClass — the escalation invariant', () => {
  it.each(COLLAPSE_TABLE)(
    'collapses $verdict.kind/$verdict.source$verdict.reason to the shipped outcome class',
    ({ verdict, outcomeClass }) => {
      expect(toOutcomeClass(verdict)).toBe(outcomeClass);
    }
  );

  it('escalates EXACTLY the judged defects and the fail-safe blocks', () => {
    const escalating = COLLAPSE_TABLE.filter(
      (r) => toOutcomeClass(r.verdict) === 'quality-fail'
    ).map((r) => r.verdict.kind);
    expect([...new Set(escalating)].sort()).toEqual(['defect', 'fail-safe']);
  });

  it('never escalates a clean judgment or an unjudged dispatch', () => {
    const neutral = COLLAPSE_TABLE.filter((r) => toOutcomeClass(r.verdict) === undefined).map(
      (r) => r.verdict.kind
    );
    expect([...new Set(neutral)].sort()).toEqual(['clean', 'unjudged']);
  });

  it('a judged defect and a fail-safe block are indistinguishable AFTER the collapse (the motivation)', () => {
    const judged = defectVerdict('retrospective');
    const failSafe = failSafeVerdict('store-unreadable');
    expect(toOutcomeClass(judged)).toBe(toOutcomeClass(failSafe));
    expect(judged.kind).not.toBe(failSafe.kind); // …but distinguishable BEFORE it
  });

  it('a clean judgment and an unjudged dispatch are indistinguishable AFTER the collapse', () => {
    expect(toOutcomeClass(cleanVerdict('security'))).toBe(
      toOutcomeClass(unjudgedVerdict('empty-diff'))
    );
    expect(cleanVerdict('security').kind).not.toBe(unjudgedVerdict('empty-diff').kind);
  });
});

describe('constructors', () => {
  it('build the variant they name', () => {
    expect(defectVerdict('security')).toEqual({ kind: 'defect', source: 'security' });
    expect(cleanVerdict('acceptance-eval')).toEqual({ kind: 'clean', source: 'acceptance-eval' });
    expect(unjudgedVerdict('router-off')).toEqual({ kind: 'unjudged', reason: 'router-off' });
    expect(failSafeVerdict('internal-error')).toEqual({
      kind: 'fail-safe',
      reason: 'internal-error',
    });
  });
});

describe('outcomeVerdictToQualityVerdict', () => {
  const verdict = (over: Partial<OutcomeVerdict>): OutcomeVerdict => ({
    verdict: 'INCONCLUSIVE',
    confidence: 'low',
    rationale: 'r',
    judgedAgainst: 'success-criteria',
    unmetCriteria: [],
    authority: 'advisory',
    ...over,
  });

  it('maps a BLOCKING outcome verdict to a judged acceptance-eval DEFECT', () => {
    expect(
      outcomeVerdictToQualityVerdict(
        verdict({ verdict: 'NOT_SATISFIED', confidence: 'high', authority: 'blocking' })
      )
    ).toEqual({ kind: 'defect', source: 'acceptance-eval' });
  });

  it('maps a non-blocking outcome verdict to a judged acceptance-eval CLEAN (not unjudged)', () => {
    expect(
      outcomeVerdictToQualityVerdict(verdict({ verdict: 'SATISFIED', confidence: 'high' }))
    ).toEqual({ kind: 'clean', source: 'acceptance-eval' });
    // A forged `authority` is already stripped upstream; an advisory NOT_SATISFIED is
    // still a judgment that ran — clean, never a fail-safe block.
    expect(
      outcomeVerdictToQualityVerdict(
        verdict({ verdict: 'NOT_SATISFIED', confidence: 'medium', authority: 'advisory' })
      )
    ).toEqual({ kind: 'clean', source: 'acceptance-eval' });
  });

  it('collapses to the shipped two-valued behavior', () => {
    expect(
      toOutcomeClass(
        outcomeVerdictToQualityVerdict(
          verdict({ verdict: 'NOT_SATISFIED', confidence: 'high', authority: 'blocking' })
        )
      )
    ).toBe('quality-fail');
    expect(
      toOutcomeClass(outcomeVerdictToQualityVerdict(verdict({ verdict: 'SATISFIED' })))
    ).toBeUndefined();
  });
});

describe('afterCleanSecurityScan', () => {
  it('reports the security scan CLEAN when the acceptance-eval declined to run', () => {
    expect(afterCleanSecurityScan(unjudgedVerdict('eval-declined'))).toEqual({
      kind: 'clean',
      source: 'security',
    });
  });

  it('keeps a real acceptance-eval judgment (defect or clean)', () => {
    expect(afterCleanSecurityScan(defectVerdict('acceptance-eval'))).toEqual({
      kind: 'defect',
      source: 'acceptance-eval',
    });
    expect(afterCleanSecurityScan(cleanVerdict('acceptance-eval'))).toEqual({
      kind: 'clean',
      source: 'acceptance-eval',
    });
  });

  it('keeps an acceptance-eval internal error unjudged (never laundered into clean)', () => {
    expect(afterCleanSecurityScan(unjudgedVerdict('internal-error'))).toEqual({
      kind: 'unjudged',
      reason: 'internal-error',
    });
  });

  it('never changes the collapsed outcome class', () => {
    for (const v of [
      unjudgedVerdict('eval-declined'),
      unjudgedVerdict('internal-error'),
      defectVerdict('acceptance-eval'),
      cleanVerdict('acceptance-eval'),
    ]) {
      expect(toOutcomeClass(afterCleanSecurityScan(v))).toBe(toOutcomeClass(v));
    }
  });
});

describe('describeVerdict / qualityVerdictLogFields', () => {
  it('describes a judged verdict by source', () => {
    expect(describeVerdict(defectVerdict('security'))).toEqual({
      kind: 'defect',
      source: 'security',
    });
  });

  it('describes an unjudged / fail-safe verdict by reason', () => {
    expect(describeVerdict(unjudgedVerdict('no-record'))).toEqual({
      kind: 'unjudged',
      reason: 'no-record',
    });
    expect(describeVerdict(failSafeVerdict('prediction-unparseable'))).toEqual({
      kind: 'fail-safe',
      reason: 'prediction-unparseable',
    });
  });

  it('carries BOTH verdicts in one log payload', () => {
    expect(
      qualityVerdictLogFields(defectVerdict('security'), failSafeVerdict('store-unreadable'))
    ).toEqual({
      quality: { kind: 'defect', source: 'security' },
      retrospective: { kind: 'fail-safe', reason: 'store-unreadable' },
    });
  });

  it('renders an unrecorded verdict as null rather than inventing one', () => {
    expect(qualityVerdictLogFields(undefined, undefined)).toEqual({
      quality: null,
      retrospective: null,
    });
  });
});
