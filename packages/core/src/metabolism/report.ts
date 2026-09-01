/**
 * Basal token metabolism — report builder (#1628).
 *
 * Reduces a ledger of {@link SpendEvent}s into a {@link MetabolismReport}: the
 * basal-share metric (with its explicitly declared denominator and an
 * unattributable bucket), a per-workflow-class breakdown, and the ranked
 * maintenance-waste list (which loop burns the most basal spend).
 *
 * Pure and total: an empty ledger yields a fully-zeroed report and never
 * throws. Reporting only — no budget-gate wiring (deferred, #1628).
 */

import {
  classifySpend,
  DEFAULT_METABOLISM_CONFIG,
  SPEND_CLASSES,
  type MetabolismConfig,
  type SpendClass,
  type SpendEvent,
} from './classify';

/** Per-workflow-class rollup of classified spend. */
export interface WorkflowClassBreakdown {
  /** The workflow class. */
  workflowClass: string;
  /** Total tokens across every class for this workflow. */
  totalTokens: number;
  /** Tokens classified basal. */
  basalTokens: number;
  /** Tokens classified anabolic. */
  anabolicTokens: number;
  /** Tokens that could not be attributed. */
  unattributableTokens: number;
  /**
   * Basal share for this workflow class over its *attributable* spend
   * (`basal / (basal + anabolic)`); `null` when the workflow has no
   * attributable spend (denominator zero).
   */
  basalShare: number | null;
}

/** One entry in the ranked maintenance-waste decomposition. */
export interface MaintenanceWasteEntry {
  /**
   * The maintenance loop identifier — `SpendEvent.maintenanceLoop` when set,
   * otherwise the workflow class.
   */
  loop: string;
  /** Basal tokens burned by this loop. */
  basalTokens: number;
  /** This loop's share of total basal spend (0-1); 0 when there is no basal spend. */
  shareOfBasal: number;
}

/**
 * The metabolism report. Every field is declared explicitly so the basal share,
 * its denominator, and the unattributable bucket are all visible in every
 * report (acceptance criterion #3).
 */
export interface MetabolismReport {
  /** Total tokens across the whole ledger (basal + anabolic + unattributable). */
  totalTokens: number;
  /** Tokens that produced no new artifact/decision/fact. */
  basalTokens: number;
  /** Tokens that produced a new artifact/decision/fact. */
  anabolicTokens: number;
  /** Tokens with no usable outcome linkage. */
  unattributableTokens: number;
  /**
   * The declared denominator for {@link basalShare}: attributable spend only
   * (`basalTokens + anabolicTokens`). The unattributable bucket is excluded
   * from the denominator and reported separately — never silently folded in.
   */
  denominatorTokens: number;
  /**
   * Basal share = `basalTokens / denominatorTokens`. `null` when the
   * denominator is zero (no attributable spend), so callers never see a
   * fabricated 0/0 = 0.
   */
  basalShare: number | null;
  /** Unattributable share of *total* spend (`unattributableTokens / totalTokens`); 0 when empty. */
  unattributableShare: number;
  /** Number of events in the ledger. */
  eventCount: number;
  /** Per-workflow-class breakdown, sorted by total tokens descending. */
  byWorkflowClass: WorkflowClassBreakdown[];
  /**
   * Ranked maintenance-waste list: basal spend grouped by maintenance loop,
   * sorted by basal tokens descending (deterministic loop-name tiebreak).
   */
  rankedWaste: MaintenanceWasteEntry[];
}

interface ClassAccumulator {
  basal: number;
  anabolic: number;
  unattributable: number;
}

function emptyAcc(): ClassAccumulator {
  return { basal: 0, anabolic: 0, unattributable: 0 };
}

function addToAcc(acc: ClassAccumulator, klass: SpendClass, tokens: number): void {
  if (klass === 'basal') acc.basal += tokens;
  else if (klass === 'anabolic') acc.anabolic += tokens;
  else acc.unattributable += tokens;
}

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function buildWorkflowBreakdown(
  byClassMap: Map<string, ClassAccumulator>
): WorkflowClassBreakdown[] {
  const rows: WorkflowClassBreakdown[] = [];
  for (const [workflowClass, acc] of byClassMap) {
    const totalTokens = acc.basal + acc.anabolic + acc.unattributable;
    rows.push({
      workflowClass,
      totalTokens,
      basalTokens: acc.basal,
      anabolicTokens: acc.anabolic,
      unattributableTokens: acc.unattributable,
      basalShare: safeShare(acc.basal, acc.basal + acc.anabolic),
    });
  }
  rows.sort(
    (a, b) => b.totalTokens - a.totalTokens || a.workflowClass.localeCompare(b.workflowClass)
  );
  return rows;
}

function buildRankedWaste(
  byLoopBasal: Map<string, number>,
  totalBasal: number
): MaintenanceWasteEntry[] {
  const rows: MaintenanceWasteEntry[] = [];
  for (const [loop, basalTokens] of byLoopBasal) {
    if (basalTokens <= 0) continue;
    rows.push({
      loop,
      basalTokens,
      shareOfBasal: totalBasal > 0 ? basalTokens / totalBasal : 0,
    });
  }
  rows.sort((a, b) => b.basalTokens - a.basalTokens || a.loop.localeCompare(b.loop));
  return rows;
}

/**
 * Build the metabolism report from a spend ledger.
 *
 * @param events - the normalized spend ledger (see the telemetry adapter).
 * @param config - classifier configuration (default: {@link DEFAULT_METABOLISM_CONFIG}).
 */
export function buildMetabolismReport(
  events: readonly SpendEvent[],
  config: MetabolismConfig = DEFAULT_METABOLISM_CONFIG
): MetabolismReport {
  const overall = emptyAcc();
  const byClassMap = new Map<string, ClassAccumulator>();
  const byLoopBasal = new Map<string, number>();

  for (const event of events) {
    const tokens = Number.isFinite(event.tokens) && event.tokens > 0 ? event.tokens : 0;
    const klass = classifySpend(event, config);

    addToAcc(overall, klass, tokens);

    const wfAcc = byClassMap.get(event.workflowClass) ?? emptyAcc();
    addToAcc(wfAcc, klass, tokens);
    byClassMap.set(event.workflowClass, wfAcc);

    if (klass === 'basal' && tokens > 0) {
      const loop = event.maintenanceLoop ?? event.workflowClass;
      byLoopBasal.set(loop, (byLoopBasal.get(loop) ?? 0) + tokens);
    }
  }

  const totalTokens = overall.basal + overall.anabolic + overall.unattributable;
  const denominatorTokens = overall.basal + overall.anabolic;

  return {
    totalTokens,
    basalTokens: overall.basal,
    anabolicTokens: overall.anabolic,
    unattributableTokens: overall.unattributable,
    denominatorTokens,
    basalShare: safeShare(overall.basal, denominatorTokens),
    unattributableShare: totalTokens > 0 ? overall.unattributable / totalTokens : 0,
    eventCount: events.length,
    byWorkflowClass: buildWorkflowBreakdown(byClassMap),
    rankedWaste: buildRankedWaste(byLoopBasal, overall.basal),
  };
}

// Re-export SPEND_CLASSES so report consumers don't need a second import.
export { SPEND_CLASSES };
