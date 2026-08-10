import type { SyncResult, ExternalSyncOptions, SuppressedInbound } from '@harness-engineering/core';
import { logger } from '../../output/logger';

/**
 * What a `harness roadmap sync` run reports.
 *
 * One responsibility: the shape of a sync run's result and how it is rendered —
 * both the `--json` payload and the prose. Deliberately separate from the
 * command wiring (`sync.ts`) and from the pass/abstain/fail decision
 * (`sync-verdict.ts`), which consumes this shape but does not build it.
 */

/** Machine-readable report emitted by `--json` and used to derive the exit code. */
export interface RoadmapSyncReport {
  /** Whether writes were performed (`--apply`) or only computed. */
  mode: 'dry-run' | 'apply';
  /** Guard state for this run, echoed so a CI log records what was permitted. */
  guards: {
    allowCreate: boolean;
    syncIssueState: boolean;
    forceSync: boolean;
  };
  /** The denominator: what was actually examined. `ticketsFetched: null` = fetch failed. */
  examined: { roadmapRows: number; ticketsFetched: number | null };
  /** Writes actually performed (empty in dry-run mode). */
  pushed: {
    created: Array<{ externalId: string; url: string }>;
    updated: string[];
  };
  /** Changes computed but not performed (populated in dry-run mode). */
  planned: { creates: Array<{ feature: string; milestone: string }>; updates: string[] };
  /** Execution fields pulled back from the tracker. */
  pulled: {
    assignmentChanges: Array<{ feature: string; from: string | null; to: string | null }>;
    localWrites: string[];
  };
  /** Changes a guard deliberately withheld — never silently dropped. */
  skipped: {
    creates: Array<{ feature: string; milestone: string; reason: string }>;
    stateChanges: Array<{ externalId: string; from: string; to: string }>;
    /**
     * Inbound (tracker → roadmap) writes withheld because the tracker had no
     * opinion. The whole point of collecting these in the engine is that an
     * operator debugging "why did my GitHub unassign not take effect" is not
     * met with silence — dropping them here would restore the silence one
     * layer up.
     */
    inbound: SuppressedInbound[];
  };
  /** Per-feature errors (the sync itself never throws). */
  errors: Array<{ featureOrId: string; error: string }>;
}

/**
 * Project a core {@link SyncResult} into the reportable/JSON shape.
 *
 * `Error` objects are flattened to message strings here so the report is always
 * JSON-serializable — a CI consumer must never get `{}` where an error was.
 */
export function buildReport(result: SyncResult, options: ExternalSyncOptions): RoadmapSyncReport {
  return {
    mode: result.dryRun ? 'dry-run' : 'apply',
    guards: {
      allowCreate: options.allowCreate ?? true,
      syncIssueState: options.syncIssueState ?? true,
      forceSync: options.forceSync ?? false,
    },
    examined: result.examined,
    pushed: {
      created: result.created.map((t) => ({ externalId: t.externalId, url: t.url })),
      updated: result.updated,
    },
    planned: { creates: result.planned.creates, updates: result.planned.updates },
    pulled: {
      assignmentChanges: result.assignmentChanges,
      localWrites: result.planned.localWrites,
    },
    skipped: {
      creates: result.skippedCreates,
      stateChanges: result.skippedStateChanges,
      inbound: result.suppressedInbound,
    },
    errors: result.errors.map((e) => ({ featureOrId: e.featureOrId, error: e.error.message })),
  };
}

/**
 * Log the human-readable report. Always states the denominator first — what was
 * examined — so a reader never has to infer it from the change counts.
 */
export function logSyncReport(report: RoadmapSyncReport): void {
  logDenominator(report);
  logChanges(report);
  logSuppressions(report);

  for (const e of report.errors) {
    logger.error(`${e.featureOrId}: ${e.error}`);
  }
  if (report.errors.length === 0 && report.mode === 'apply') {
    logger.success('Roadmap and tracker converged.');
  }
}

/** The denominator line: always first, so it is never inferred from change counts. */
function logDenominator(report: RoadmapSyncReport): void {
  const { roadmapRows, ticketsFetched } = report.examined;
  const fetched = ticketsFetched === null ? 'FETCH FAILED' : String(ticketsFetched);
  const onOff = (enabled: boolean): string => (enabled ? 'on' : 'off');
  const force = report.guards.forceSync ? ', force=on' : '';
  logger.info(
    `Examined ${roadmapRows} roadmap row(s) against ${fetched} tracker ticket(s) ` +
      `[mode=${report.mode}, create=${onOff(report.guards.allowCreate)}, ` +
      `state-change=${onOff(report.guards.syncIssueState)}${force}].`
  );
}

/** What was written, or (in dry run) what would have been. */
function logChanges(report: RoadmapSyncReport): void {
  if (report.mode !== 'dry-run') {
    logger.info(
      `Pushed ${report.pushed.created.length} create(s) and ` +
        `${report.pushed.updated.length} patch(es); pulled ` +
        `${report.pulled.assignmentChanges.length} assignment change(s).`
    );
    return;
  }
  logger.info(
    `Dry run — no writes issued. Would create ${report.planned.creates.length}, ` +
      `patch ${report.planned.updates.length} ticket(s), and rewrite ` +
      `${report.pulled.localWrites.length} local row(s). Re-run with --apply to write.`
  );
  for (const c of report.planned.creates) {
    logger.dim(`  would create: ${c.feature} (${c.milestone})`);
  }
}

/** Changes a guard withheld. Warn-level so they are never lost in the noise. */
function logSuppressions(report: RoadmapSyncReport): void {
  const { creates, stateChanges, inbound } = report.skipped;
  if (creates.length > 0) {
    logger.warn(
      `Skipped ${creates.length} create(s) (--no-create): ` +
        creates.map((c) => c.feature).join(', ')
    );
  }
  if (stateChanges.length > 0) {
    logger.warn(
      `Suppressed ${stateChanges.length} issue state change(s) (--no-state-change): ` +
        stateChanges.map((s) => `${s.externalId} ${s.from}→${s.to}`).join(', ')
    );
  }
  if (inbound.length > 0) {
    // Named per-feature with the reason: "why didn't my GitHub change land?"
    // must be answerable from this line without reading --json.
    logger.warn(
      `Withheld ${inbound.length} inbound write(s) (tracker had no opinion): ` +
        inbound
          .map((s) => `${s.feature} ${s.field} ${s.from ?? '—'}→${s.to ?? '—'} (${s.reason})`)
          .join(', ')
    );
  }
}
