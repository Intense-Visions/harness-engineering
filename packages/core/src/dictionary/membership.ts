/**
 * Trained context dictionaries — membership by measurement (#1635).
 *
 * "Measurement decides membership: a term enters the dictionary when its
 * `frequency × length` crosses the amortization threshold and leaves when usage
 * decays — the dictionary is trained and re-trained, not curated by hand."
 *
 * This module is that decision. Given the previously-live labels and a freshly
 * mined window, it emits an enter / retain / retire decision per term, driven
 * ENTIRELY by the measured score — no hand-curated allow/deny list anywhere in
 * the path. It uses hysteresis (a lower retirement threshold than the entry
 * threshold) so a term hovering at the boundary does not thrash in and out
 * window to window.
 *
 * The amortization model is explicit. Re-sending a span verbatim on every use
 * costs `frequency × length` characters. Binding it to a handle costs `length`
 * once (to define it) plus `handleCost × frequency` (the handle per use). The
 * net saving is therefore `frequency × (length − handleCost) − length`; a term
 * is worth binding only when that is positive. The entry threshold is expressed
 * in the same `frequency × length` currency the issue names.
 *
 * Scope note (#1635): report-only. These decisions produce the codebook +
 * membership report; they do not change how context is served.
 */

import type { MinedTerm } from './mine';

/** Membership decision for a single term. */
export type MembershipStatus = 'enter' | 'retain' | 'retire';

/** Configuration for the membership scorer. */
export interface MembershipConfig {
  /**
   * Entry threshold in `frequency × length` units. A term not yet live enters
   * when its score is ≥ this. Default: 200 (e.g. a 100-char span seen in 2 docs).
   */
  entryThreshold: number;
  /**
   * Retirement threshold in `frequency × length` units. A live term retires when
   * its score drops BELOW this. Must be ≤ {@link entryThreshold} to give
   * hysteresis; a live term whose score sits between the two thresholds is
   * retained (the anti-thrash band). Default: 100.
   */
  retirementThreshold: number;
  /**
   * Per-use handle cost in characters — the amortization denominator. A term is
   * only ever admitted when it also clears the net-saving test
   * (`frequency × (length − handleCost) − length > 0`), regardless of the raw
   * score threshold. Default: 8 (a short `@kb:xxxxxxxxxxxx` reference amortized).
   */
  handleCost: number;
}

/** The default membership configuration. */
export const DEFAULT_MEMBERSHIP_CONFIG: MembershipConfig = {
  entryThreshold: 200,
  retirementThreshold: 100,
  handleCost: 8,
};

/**
 * Projected net character saving from binding a term to a handle:
 * `frequency × (length − handleCost) − length`. Positive ⇒ the dictionary entry
 * pays for itself. Pure arithmetic.
 */
export function netSaving(term: MinedTerm, handleCost: number): number {
  return term.frequency * (term.length - handleCost) - term.length;
}

/** A membership decision with the evidence that drove it. */
export interface MembershipDecision {
  label: string;
  status: MembershipStatus;
  /** The measured `frequency × length` score for this window. */
  score: number;
  /** Projected net character saving (see {@link netSaving}). */
  projectedSaving: number;
  /** Whether the term was live before this window (for enter/retain/retire). */
  wasLive: boolean;
  /** The mined term, when present this window (absent ⇒ decayed to zero usage). */
  term?: MinedTerm;
}

/**
 * Decide membership for a training window.
 *
 * @param mined       - the freshly mined candidate terms for this window.
 * @param liveLabels  - labels that were live in the codebook before this window.
 * @param config      - thresholds + amortization cost.
 *
 * A term enters when it was not live and clears BOTH the entry threshold and the
 * net-saving test. A live term is retained while its score stays at/above the
 * retirement threshold (and still saves), and retires when its score drops below
 * it — including all the way to zero (a previously-live label absent from this
 * window's mining has decayed and retires). Deterministic; sorted by score
 * descending then label.
 */
export function decideMembership(
  mined: readonly MinedTerm[],
  liveLabels: ReadonlySet<string>,
  config: MembershipConfig = DEFAULT_MEMBERSHIP_CONFIG
): MembershipDecision[] {
  const decisions: MembershipDecision[] = [];
  const minedByLabel = new Map(mined.map((t) => [t.label, t]));

  for (const term of mined) {
    const score = term.frequencyTimesLength;
    const saving = netSaving(term, config.handleCost);
    const wasLive = liveLabels.has(term.label);
    const savesTokens = saving > 0;

    let status: MembershipStatus;
    if (wasLive) {
      // Hysteresis: retain until score falls below the retirement threshold.
      status = score >= config.retirementThreshold && savesTokens ? 'retain' : 'retire';
    } else {
      status = score >= config.entryThreshold && savesTokens ? 'enter' : 'retire';
    }

    decisions.push({
      label: term.label,
      status,
      score,
      projectedSaving: saving,
      wasLive,
      term,
    });
  }

  // Previously-live labels absent from this window decayed to zero usage: retire.
  for (const label of liveLabels) {
    if (minedByLabel.has(label)) continue;
    decisions.push({
      label,
      status: 'retire',
      score: 0,
      projectedSaving: 0,
      wasLive: true,
    });
  }

  decisions.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return decisions;
}

/** The labels that end this window live: everything that entered or was retained. */
export function liveLabelsFromDecisions(decisions: readonly MembershipDecision[]): string[] {
  return decisions
    .filter((d) => d.status === 'enter' || d.status === 'retain')
    .map((d) => d.label)
    .sort();
}
