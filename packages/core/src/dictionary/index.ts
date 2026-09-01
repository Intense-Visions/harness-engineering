/**
 * Trained context dictionaries (#1635) — a verified codebook for recurring
 * knowledge. Mine recurring spans over a corpus of past assembled contexts,
 * score candidate terms by `frequency × length` against an amortization
 * threshold, and emit a governed, versioned codebook: every term bound to a
 * verified definition with a version, deterministic expansion, and a version
 * bump whenever a definition changes. Membership is decided by measurement — a
 * term enters when it crosses the threshold and leaves when usage decays.
 *
 * Report-only: this slice produces the codebook + membership report. Wiring
 * handle-substitution into the serving/assembly path is deferred.
 */

export {
  mineRecurringSpans,
  normalizeSpanText,
  DEFAULT_MINE_CONFIG,
  type CorpusSpan,
  type CorpusDocument,
  type MinedTerm,
  type MineConfig,
} from './mine';

export {
  reconcileCodebook,
  expand,
  deriveHandle,
  definitionHash,
  verifyEntry,
  emptyCodebook,
  auditStaleReferences,
  CODEBOOK_SCHEMA_VERSION,
  HANDLE_PREFIX,
  type Codebook,
  type CodebookEntry,
  type CodebookHistoryRecord,
  type TermBinding,
  type PinnedReference,
  type StaleReference,
} from './codebook';

export {
  decideMembership,
  liveLabelsFromDecisions,
  netSaving,
  DEFAULT_MEMBERSHIP_CONFIG,
  type MembershipStatus,
  type MembershipConfig,
  type MembershipDecision,
} from './membership';

export {
  buildCodebookReport,
  type CodebookReport,
  type BuildCodebookReportInputs,
  type SavingsProjection,
} from './report';
