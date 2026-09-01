/**
 * Trained context dictionaries — the codebook + membership report (#1635).
 *
 * The report-only deliverable. One call trains over a corpus window and a prior
 * codebook and returns everything a human needs to inspect the trained
 * dictionary WITHOUT anything being substituted into served context:
 *
 *  - the freshly mined candidates and their `frequency × length` scores;
 *  - the enter / retain / retire membership decisions (measurement-driven);
 *  - the resulting governed, versioned codebook (with drift history);
 *  - the projected token/character savings the codebook WOULD yield if wired.
 *
 * Because substitution is deferred (#1635), the projected saving is exactly
 * that — a projection over the corpus — and task-outcome degradation is zero by
 * construction (nothing served changes). Pure and total.
 */

import { mineRecurringSpans, type CorpusDocument, type MineConfig, type MinedTerm } from './mine';
import {
  decideMembership,
  liveLabelsFromDecisions,
  netSaving,
  type MembershipConfig,
  type MembershipDecision,
  DEFAULT_MEMBERSHIP_CONFIG,
} from './membership';
import { reconcileCodebook, emptyCodebook, type Codebook, type TermBinding } from './codebook';

/** Projected savings from the codebook, in characters and estimated tokens. */
export interface SavingsProjection {
  /** Characters re-transmitted verbatim across the corpus for the live terms. */
  baselineChars: number;
  /** Characters the same terms would cost as define-once + handle-per-use. */
  dictionaryChars: number;
  /** `baselineChars − dictionaryChars`; never negative (terms that don't save are excluded). */
  savedChars: number;
  /** `savedChars` as a fraction of `baselineChars` (0 when baseline is 0). */
  savedFraction: number;
  /** Estimated tokens saved (chars / 4, the repo's heuristic). */
  savedTokensEstimate: number;
}

/** The full report. */
export interface CodebookReport {
  /** Number of documents in the training corpus window. */
  corpusSize: number;
  /** The mined candidate terms (scored, sorted by score desc). */
  mined: MinedTerm[];
  /** The membership decisions (enter / retain / retire). */
  decisions: MembershipDecision[];
  /** Count of decisions by status. */
  membershipCounts: { enter: number; retain: number; retire: number };
  /** The reconciled governed codebook after this window. */
  codebook: Codebook;
  /** Number of terms whose version bumped this window (definition drift). */
  driftBumps: number;
  /** Projected savings the live codebook would yield if substitution were wired. */
  savings: SavingsProjection;
}

/** Inputs to {@link buildCodebookReport}. */
export interface BuildCodebookReportInputs {
  /** The training corpus window (assembled-context documents, segmented). */
  corpus: readonly CorpusDocument[];
  /** The codebook from the previous training run (default: empty). */
  priorCodebook?: Codebook;
  /** Mining configuration. */
  mineConfig?: MineConfig;
  /** Membership configuration. */
  membershipConfig?: MembershipConfig;
}

const ESTIMATED_CHARS_PER_TOKEN = 4;

/**
 * Train over one corpus window: mine → decide membership → reconcile the
 * governed codebook → project savings.
 *
 * The codebook's live bindings are exactly the terms that entered or were
 * retained, each bound to the canonical mined definition — so `reconcileCodebook`
 * bumps a version iff a retained/entered term's definition changed against the
 * prior codebook, and retires everything else.
 */
export function buildCodebookReport(inputs: BuildCodebookReportInputs): CodebookReport {
  const {
    corpus,
    priorCodebook = emptyCodebook(),
    mineConfig,
    membershipConfig = DEFAULT_MEMBERSHIP_CONFIG,
  } = inputs;

  const mined = mineRecurringSpans(corpus, mineConfig);
  const priorLiveLabels = new Set(priorCodebook.entries.map((e) => e.label));
  const decisions = decideMembership(mined, priorLiveLabels, membershipConfig);

  const liveLabels = new Set(liveLabelsFromDecisions(decisions));
  const minedByLabel = new Map(mined.map((t) => [t.label, t]));

  const liveBindings: TermBinding[] = [];
  for (const label of liveLabels) {
    const term = minedByLabel.get(label);
    if (term) liveBindings.push({ label, definition: term.definition });
  }
  liveBindings.sort((a, b) => a.label.localeCompare(b.label));

  const codebook = reconcileCodebook(priorCodebook, liveBindings);

  // Drift bumps: a live label whose version is now higher than in the prior book.
  const priorVersionByLabel = new Map(priorCodebook.entries.map((e) => [e.label, e.version]));
  let driftBumps = 0;
  for (const entry of codebook.entries) {
    const priorVersion = priorVersionByLabel.get(entry.label);
    if (priorVersion !== undefined && entry.version > priorVersion) driftBumps += 1;
  }

  const membershipCounts = {
    enter: decisions.filter((d) => d.status === 'enter').length,
    retain: decisions.filter((d) => d.status === 'retain').length,
    retire: decisions.filter((d) => d.status === 'retire').length,
  };

  const savings = projectSavings(codebook, minedByLabel, membershipConfig);

  return {
    corpusSize: corpus.length,
    mined,
    decisions,
    membershipCounts,
    codebook,
    driftBumps,
    savings,
  };
}

/**
 * Project the savings the live codebook would yield. For every live entry that
 * has a mined term this window, baseline = `frequency × length` (verbatim
 * re-transmission) and dictionary = `length + frequency × handleCost`. Only
 * net-positive terms contribute, so `savedChars` is never negative.
 */
function projectSavings(
  codebook: Codebook,
  minedByLabel: Map<string, MinedTerm>,
  membershipConfig: MembershipConfig
): SavingsProjection {
  let baselineChars = 0;
  let savedChars = 0;

  for (const entry of codebook.entries) {
    const term = minedByLabel.get(entry.label);
    if (!term) continue;
    const saving = netSaving(term, membershipConfig.handleCost);
    if (saving <= 0) continue;
    baselineChars += term.frequencyTimesLength;
    savedChars += saving;
  }

  const dictionaryChars = baselineChars - savedChars;
  const savedFraction = baselineChars > 0 ? savedChars / baselineChars : 0;
  const savedTokensEstimate = Math.round(savedChars / ESTIMATED_CHARS_PER_TOKEN);

  return { baselineChars, dictionaryChars, savedChars, savedFraction, savedTokensEstimate };
}
