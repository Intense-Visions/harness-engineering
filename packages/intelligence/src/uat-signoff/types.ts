/** The three per-item UAT dispositions a human can record for a BRD item. */
export type UatItemDisposition = 'ACCEPT' | 'REJECT' | 'CHANGES_REQUESTED';

/** The single overall UAT verdict the human signs off with. */
export type UatOverallDecision = 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED';

/** One acceptance item the human ruled on during sign-off. */
export interface UatSignoffItem {
  /**
   * Stable identifier of the item — a Success-Criterion id from the change's
   * `proposal.md` (e.g. `SC3`). Used verbatim; the recorder never invents ids.
   */
  id: string;
  /** The human's disposition for this item. */
  disposition: UatItemDisposition;
  /** Optional free-text note the human attached to the disposition. */
  note?: string;
}

/**
 * A recorded human UAT sign-off for one change.
 *
 * This is the HUMAN's decision, captured verbatim: no LLM produces the verdict
 * and no ship authority is derived. It is the far-end, human-authority mirror of
 * the lifecycle's machine gates — intent(spec Success Criteria)-vs-shipped-reality,
 * human-judged. The recorder maps it onto the shared `execution_outcome` node
 * shape so the existing eval-fail-rate signal and effectiveness baselines consume
 * it for free.
 */
export interface UatSignoffInput {
  /** Change slug — the `docs/changes/<slug>/` owner (same slug as spec/plan/review). */
  slug: string;
  /** The overall human verdict. */
  decision: UatOverallDecision;
  /** Name/identity of the human who signed off. */
  signedOffBy: string;
  /** Per-item dispositions ruled on during the interview. */
  items: UatSignoffItem[];
  /** Success-Criterion ids the sign-off closes (the accepted acceptance items). */
  criteriaRefs?: string[];
  /** ISO timestamp of the sign-off; defaults to now when omitted. */
  timestamp?: string;
}
