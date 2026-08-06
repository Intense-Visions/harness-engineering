/** The three per-item UAT dispositions a human can record for a BRD item. */
export type UatItemDisposition = 'ACCEPT' | 'REJECT' | 'CHANGES_REQUESTED';

/** The single overall UAT verdict the human signs off with. */
export type UatOverallDecision = 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED';

/** One acceptance item the human ruled on during sign-off. */
export interface UatSignoffItem {
  /**
   * Stable identifier of the item — e.g. a BRD gap id (`G3`) or an
   * acceptance-criterion id. Used verbatim; the recorder never invents ids.
   */
  id: string;
  /** The human's disposition for this item. */
  disposition: UatItemDisposition;
  /** Optional free-text note the human attached to the disposition. */
  note?: string;
}

/**
 * A recorded human UAT sign-off for one engagement.
 *
 * This is the HUMAN's decision, captured verbatim: no LLM produces the verdict
 * and no ship authority is derived. It is the far-end mirror of the inception
 * BRD — intent(BRD)-vs-shipped-reality, human-judged. The recorder maps it onto
 * the shared `execution_outcome` node shape so the existing eval-fail-rate
 * signal and effectiveness baselines consume it for free.
 */
export interface UatSignoffInput {
  /** Engagement slug — the `docs/inception/<engagement>/` owner. */
  engagement: string;
  /** The overall human verdict. */
  decision: UatOverallDecision;
  /** Name/identity of the human who signed off. */
  signedOffBy: string;
  /** Per-item dispositions ruled on during the interview. */
  items: UatSignoffItem[];
  /** BRD/gap ids the sign-off closes (the accepted acceptance items). */
  brdRefs?: string[];
  /** ISO timestamp of the sign-off; defaults to now when omitted. */
  timestamp?: string;
}
