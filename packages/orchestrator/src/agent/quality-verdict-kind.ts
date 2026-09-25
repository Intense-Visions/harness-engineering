import type { OutcomeVerdict } from '@harness-engineering/intelligence';
import { outcomeVerdictToQualityFail } from './quality-verdict';

/**
 * DISCRIMINATED quality verdicts (#2221 prerequisite 1).
 *
 * The shipped agent-exit feeders each returned `'quality-fail' | undefined`, which
 * collapses four distinct situations into two values: an operator whose unit escalated
 * could not tell a JUDGED defect (the code is bad) from a FAIL-SAFE block (the triage
 * store hiccuped and we refuse to pass silently), and a CLEAN judgment ("the scan ran
 * and found nothing") from an UNJUDGED dispatch ("there was nothing to scan").
 *
 * This module adds the discrimination WITHOUT moving escalation behavior: every verdict
 * collapses back through {@link toOutcomeClass} to exactly the value the feeder returned
 * before, and the exit seam composes those collapsed values with the same `??`.
 *
 *  - `defect`    — something JUDGED the change and found it wanting.
 *  - `clean`     — something JUDGED the change and found nothing wrong.
 *  - `unjudged`  — no judgment was made (feature off, nothing to judge, …). Neutral.
 *  - `fail-safe` — we could not judge, and the conservative rule blocks anyway
 *                  (a triaged unit whose prediction we cannot read must never merge
 *                  just because the store failed).
 */

/** The judge that produced a `defect` / `clean` verdict. */
export type QualityVerdictSource = 'security' | 'acceptance-eval' | 'retrospective';

/** Why no judgment was made. Neutral — collapses to `undefined`. */
export type QualityUnjudgedReason =
  /** The adaptive router is off: the feeders are a no-op (zero cost). */
  | 'router-off'
  /** The agent introduced no added lines — nothing to judge. */
  | 'empty-diff'
  /** Roadmap auto-triage is off: the retrospective is a no-op. */
  | 'triage-off'
  /** No roadmap External-ID, so this unit cannot carry a stored prediction. */
  | 'no-external-id'
  /** An ordinary (non-triaged) run: no stored prediction record at all. */
  | 'no-record'
  /** The acceptance-eval did not run (opt-in off, no spec, no provider, empty diff text). */
  | 'eval-declined'
  /** The triage store could not be read on a unit with no independent triaged signal. */
  | 'store-unreadable'
  /** A guarded internal error: best-effort logged, never breaks completion. */
  | 'internal-error';

/** Why we blocked WITHOUT a judgment. Collapses to `'quality-fail'` (escalates). */
export type QualityFailSafeReason =
  /** Spec-bearing (triaged) unit whose triage store is unreadable. */
  | 'store-unreadable'
  /** Triaged unit whose stored prediction is missing or garbled. */
  | 'prediction-unparseable'
  /** The retrospective errored; SC7 takes the block+escalate path, never a silent pass. */
  | 'internal-error';

/** A quality verdict that says WHAT happened, not just whether to escalate. */
export type QualityVerdict =
  | { kind: 'defect'; source: QualityVerdictSource }
  | { kind: 'clean'; source: QualityVerdictSource }
  | { kind: 'unjudged'; reason: QualityUnjudgedReason }
  | { kind: 'fail-safe'; reason: QualityFailSafeReason };

/** A judged defect: `source` found something wrong in the introduced change. */
export function defectVerdict(source: QualityVerdictSource): QualityVerdict {
  return { kind: 'defect', source };
}

/** A judged clean: `source` ran and found nothing wrong. Never a `quality-pass`. */
export function cleanVerdict(source: QualityVerdictSource): QualityVerdict {
  return { kind: 'clean', source };
}

/** No judgment was made, for `reason`. Neutral. */
export function unjudgedVerdict(reason: QualityUnjudgedReason): QualityVerdict {
  return { kind: 'unjudged', reason };
}

/** We could not judge and block conservatively, for `reason`. */
export function failSafeVerdict(reason: QualityFailSafeReason): QualityVerdict {
  return { kind: 'fail-safe', reason };
}

/**
 * Collapse a discriminated verdict to the shipped two-valued escalation class.
 *
 * THE INVARIANT: this mapping reproduces, exactly, what each feeder returned before
 * discrimination — a judged defect and a fail-safe block escalate; a clean judgment and
 * an unjudged dispatch are neutral. `quality-verdict-kind.test.ts` pins every variant
 * table-driven, so a drift here fails a test rather than silently changing which units
 * escalate.
 */
export function toOutcomeClass(verdict: QualityVerdict): 'quality-fail' | undefined {
  switch (verdict.kind) {
    case 'defect':
    case 'fail-safe':
      return 'quality-fail';
    case 'clean':
    case 'unjudged':
      return undefined;
  }
}

/**
 * Map an outcome-eval spec-satisfaction verdict to a discriminated quality verdict. The
 * BLOCKING rule stays in one place: this delegates to the shipped
 * {@link outcomeVerdictToQualityFail}, so only a TS-derived blocking authority is a
 * defect. Anything else is a `clean` acceptance-eval judgment — the eval DID run, which
 * is strictly more information than the old `undefined`, and still collapses to neutral.
 */
export function outcomeVerdictToQualityVerdict(verdict: OutcomeVerdict): QualityVerdict {
  return outcomeVerdictToQualityFail(verdict) === 'quality-fail'
    ? defectVerdict('acceptance-eval')
    : cleanVerdict('acceptance-eval');
}

/**
 * Compose the single-agent feeder's verdict once the security scan came back CLEAN and
 * the (opt-in) acceptance-eval has had its turn.
 *
 * When the eval DECLINED (off / no spec / no provider / empty diff text) the only
 * judgment we hold is the clean security scan, so that is what we report. A real eval
 * judgment (defect or clean) supersedes it, and an eval INTERNAL ERROR stays unjudged —
 * an error is never laundered into a clean bill of health.
 *
 * Collapse-neutral by construction: every branch maps to `undefined`, exactly as the
 * shipped `return await this.deriveAcceptanceEvalVerdict(...)` did on a clean scan.
 */
export function afterCleanSecurityScan(evalVerdict: QualityVerdict): QualityVerdict {
  return evalVerdict.kind === 'unjudged' && evalVerdict.reason === 'eval-declined'
    ? cleanVerdict('security')
    : evalVerdict;
}

/** The structured, greppable shape of one verdict in the operator-facing log. */
export type QualityVerdictLogFields =
  | { kind: 'defect' | 'clean'; source: QualityVerdictSource }
  | { kind: 'unjudged'; reason: QualityUnjudgedReason }
  | { kind: 'fail-safe'; reason: QualityFailSafeReason };

/** Flatten a verdict to `{ kind, source }` (judged) or `{ kind, reason }` (not judged). */
export function describeVerdict(verdict: QualityVerdict): QualityVerdictLogFields {
  switch (verdict.kind) {
    case 'defect':
    case 'clean':
      return { kind: verdict.kind, source: verdict.source };
    case 'unjudged':
      return { kind: 'unjudged', reason: verdict.reason };
    case 'fail-safe':
      return { kind: 'fail-safe', reason: verdict.reason };
  }
}

/**
 * The payload for the one structured `amr:quality-verdict` line emitted per agent exit.
 * Carrying BOTH feeders' verdicts is the point of the change: a fail-safe block is now
 * visibly distinct from a judged defect in the log an operator actually reads. `null`
 * means a feeder recorded no verdict at all (it should always record one).
 */
export function qualityVerdictLogFields(
  quality: QualityVerdict | undefined,
  retrospective: QualityVerdict | undefined
): {
  quality: QualityVerdictLogFields | null;
  retrospective: QualityVerdictLogFields | null;
} {
  return {
    quality: quality === undefined ? null : describeVerdict(quality),
    retrospective: retrospective === undefined ? null : describeVerdict(retrospective),
  };
}
