/**
 * The Waypoint spool shipper — the last mile from a repo-local JSONL file to a
 * live ledger (`docs/changes/waypoint-spool-shipper/proposal.md`).
 *
 * ADR-0047 has emitters "append to a local repo-side JSONL spool first and
 * ship with retry/backoff". The spool half shipped; this is the other half.
 * Until it runs, every `sdlc.*` event harness produces stops at a file, which
 * is why Waypoint's wave forecasts cannot leave cold start: the V2/V3
 * verification evidence that would end it comes from harness eval verdicts,
 * and GitHub webhooks cannot produce a verification grade.
 *
 * The contract targeted here was PROBED LIVE (2026-09-07), not assumed:
 *
 *   POST /outpost/<outpost>/project/<project>/events
 *     x-pnyon-ingest-token: <token>
 *     [ <SdlcEvent>, … ]                          — a bare JSON array
 *   200 → { results: [{ id, result }], accepted, duplicate, invalid, scrubRejected }
 *   400 → malformed body   401 → unauthorized
 *
 * That distinction is the point. Two prior harness adapters were written
 * against an assumed `/v1/items` API, were complete and green against their own
 * mocks, and pointed at a 404 the whole time.
 *
 * The per-event `results` array is what makes honest progress possible: the
 * shipper never guesses which events in a batch landed.
 */

import type { WaypointShipConfig } from '@harness-engineering/types';
import { describeViolations, validateAgainstContract } from './contract';
import {
  advanceMark,
  eventIdOf,
  readCheckpoint,
  unshippedLines,
  writeCheckpoint,
  type ShipCheckpoint,
} from './checkpoint';
import { readSpoolSegments } from './spool';

/** Default events per POST. */
export const DEFAULT_BATCH_SIZE = 500;

/** Per-event verdicts the ingest endpoint reports. */
export type IngestResultKind = 'accepted' | 'duplicate' | 'invalid' | 'scrub-rejected';

/** One entry of the ingest response's `results` array. */
export interface IngestEventResult {
  readonly id: string;
  readonly result: IngestResultKind;
}

/** The ingest endpoint's 200 body (extra fields such as `autoTrain` ignored). */
export interface IngestReportBody {
  readonly results?: readonly IngestEventResult[];
}

/**
 * `accepted` and `duplicate` both mean the event is in the ledger.
 *
 * `duplicate` is not a failure — it is at-least-once delivery working exactly
 * as ADR-0047 designed it, since ULIDs are the idempotency key. Treating it as
 * anything else would make every retry look like an error and stall progress
 * behind events that already landed.
 */
export function hasLanded(result: IngestResultKind): boolean {
  return result === 'accepted' || result === 'duplicate';
}

/**
 * `invalid` and `scrub-rejected` are terminal: identical bytes get an
 * identical verdict on every retry, forever.
 *
 * They must advance the checkpoint anyway. If progress only moved on
 * `accepted`, one malformed event would wedge the pipeline permanently and
 * every later event would silently stop shipping — the classic queue-wedge.
 * Advancing is only safe because the caller records these to a dead-letter
 * file first: a `scrub-rejected` means the scrubber caught something the
 * adopter needs to see, not a statistic to bury.
 */
export function isTerminal(result: IngestResultKind): boolean {
  return result === 'invalid' || result === 'scrub-rejected';
}

/** One event the ledger refused permanently, with why. */
export interface RejectedEvent {
  readonly id: string;
  readonly result: IngestResultKind;
  readonly line: string;
  /**
   * Why the LOCAL contract preflight refused it, when it did. Absent for events the ledger refused
   * — those carry the server's own reasons — so its presence is also the record of which side
   * made the call.
   */
  readonly contractViolations?: string;
}

/** What one `ship` run did. */
export interface ShipReport {
  /** Landed in the ledger (accepted + duplicate). */
  readonly shipped: number;
  readonly accepted: number;
  readonly duplicate: number;
  /** Permanently refused; also written to the dead-letter file. */
  readonly rejected: readonly RejectedEvent[];
  /** Events left unshipped — non-zero when a batch failed or a limit applied. */
  readonly remaining: number;
  /** POST attempts made, retries included. */
  readonly requests: number;
}

/** Transport seam, so tests drive the real batching logic without a network. */
export type ShipFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; text: () => Promise<string> }>;

export interface ShipOptions {
  readonly spoolDir: string;
  readonly config: WaypointShipConfig;
  /** Bearer credential; the caller resolves it from the environment. */
  readonly token: string;
  readonly fetchFn: ShipFetch;
  /** Cap on events sent this run (`--limit`); undefined = no cap. */
  readonly limit?: number;
  /** Compute only; issue no POST and never move the checkpoint. */
  readonly dryRun?: boolean;
  /** Retry attempts per batch for network/5xx. Default 3. */
  readonly maxAttempts?: number;
  /** Sleep between retries; injectable so tests do not wait. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Records permanently-refused events. Omitted in dry run. */
  readonly onRejected?: (rejected: readonly RejectedEvent[]) => void;
  /**
   * Skip the local contract preflight and let the ledger be the only judge.
   *
   * The escape hatch matters: the vendored contract is a SNAPSHOT of a schema pnyon generates, so
   * if pnyon widens the vocabulary before harness re-vendors, the preflight would refuse events the
   * live ledger would happily accept — a stale copy blocking good work. This flag is how an
   * operator ships anyway while the copy is refreshed.
   */
  readonly skipContractCheck?: boolean;
}

/** A failure that stopped the run, carrying an actionable message. */
export class ShipError extends Error {
  constructor(
    message: string,
    /** True when re-running unchanged could plausibly succeed. */
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ShipError';
  }
}

/** `<url>/outpost/<outpost>/project/<project>/events`, slashes normalized. */
export function ingestUrl(config: WaypointShipConfig): string {
  const base = config.url.replace(/\/+$/, '');
  const outpost = encodeURIComponent(config.outpost);
  const project = encodeURIComponent(config.project);
  return `${base}/outpost/${outpost}/project/${project}/events`;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** One spooled line paired with the segment it belongs to. */
interface PendingLine {
  readonly segmentId: string;
  readonly line: string;
  readonly id: string | null;
}

/**
 * Everything unshipped, in ULID order across segments.
 *
 * Ordering matters beyond tidiness: the ledger is a causal record, and sending
 * a claim before the intent it refers to would land evidence out of order.
 * ULIDs are time-prefixed, so lexicographic order is creation order.
 */
function collectPending(spoolDir: string, checkpoint: ShipCheckpoint): PendingLine[] {
  const pending: PendingLine[] = [];
  for (const segment of readSpoolSegments(spoolDir)) {
    for (const line of unshippedLines(checkpoint, segment.segmentId, segment.lines)) {
      pending.push({ segmentId: segment.segmentId, line, id: eventIdOf(line) });
    }
  }
  return pending.sort((a, b) => {
    if (a.id === b.id) return 0;
    if (a.id === null) return 1; // unreadable ids last; ingest judges them
    if (b.id === null) return -1;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * POST one batch, retrying only what retrying can fix.
 *
 * Network errors and 5xx get exponential backoff. 400 and 401 do not: a
 * malformed body or a bad token is a configuration fault, and retrying it
 * converts an immediate, clear error into a slow one while changing nothing.
 */
async function postBatch(
  batch: readonly PendingLine[],
  options: ShipOptions
): Promise<{ results: readonly IngestEventResult[]; requests: number }> {
  const url = ingestUrl(options.config);
  const body = `[${batch.map((p) => p.line).join(',')}]`;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const sleep = options.sleep ?? defaultSleep;
  let requests = 0;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    requests += 1;
    let status: number;
    let text: string;
    try {
      const response = await options.fetchFn(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pnyon-ingest-token': options.token,
        },
        body,
      });
      status = response.status;
      text = await response.text();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await sleep(2 ** (attempt - 1) * 100);
        continue;
      }
      throw new ShipError(`Waypoint ingest unreachable at ${url}: ${lastError}`, true);
    }

    if (status === 401) {
      throw new ShipError(
        `Waypoint ingest rejected the credential (401) at ${url}. ` +
          'Check PNYON_WAYPOINT_INGEST_TOKEN and that the same secret is set on the ' +
          'Waypoint Worker (`wrangler secret put PNYON_WAYPOINT_INGEST_TOKEN`).',
        false
      );
    }
    if (status === 400) {
      throw new ShipError(
        `Waypoint ingest refused the request body (400) at ${url}: ${text}. ` +
          'This is a client fault, not a transient one — nothing was shipped.',
        false
      );
    }
    if (status >= 500) {
      lastError = `HTTP ${status}: ${text}`;
      if (attempt < maxAttempts) {
        await sleep(2 ** (attempt - 1) * 100);
        continue;
      }
      throw new ShipError(`Waypoint ingest failed at ${url} — ${lastError}`, true);
    }
    if (status !== 200) {
      throw new ShipError(`Waypoint ingest returned HTTP ${status} at ${url}: ${text}`, false);
    }

    let parsed: IngestReportBody;
    try {
      parsed = JSON.parse(text) as IngestReportBody;
    } catch {
      throw new ShipError(`Waypoint ingest returned a non-JSON 200 body at ${url}`, false);
    }
    // No per-event results means nothing can be said to have landed. Refusing
    // to advance is the safe read: a re-send is a `duplicate`, whereas a false
    // advance loses events permanently.
    if (!Array.isArray(parsed.results)) {
      throw new ShipError(
        `Waypoint ingest returned 200 without a per-event \`results\` array at ${url}; ` +
          'cannot confirm what landed, so nothing was marked shipped.',
        false
      );
    }
    return { results: parsed.results, requests };
  }
  /* c8 ignore next */
  throw new ShipError(`Waypoint ingest failed at ${url} — ${lastError}`, true);
}

/**
 * Ship everything unshipped, in order, and report what happened.
 *
 * The checkpoint is persisted after EVERY batch rather than once at the end,
 * so an interrupted run resumes from the last confirmed event instead of
 * re-sending the whole run.
 */
export async function shipSpool(options: ShipOptions): Promise<ShipReport> {
  let checkpoint = readCheckpoint(options.spoolDir);
  const pending = collectPending(options.spoolDir, checkpoint);
  const selected =
    options.limit !== undefined ? pending.slice(0, Math.max(0, options.limit)) : pending;

  if (options.dryRun) {
    return {
      shipped: 0,
      accepted: 0,
      duplicate: 0,
      rejected: [],
      remaining: selected.length,
      requests: 0,
    };
  }

  const batchSize = Math.max(1, options.config.batchSize ?? DEFAULT_BATCH_SIZE);
  const totals = { accepted: 0, duplicate: 0 };
  const rejected: RejectedEvent[] = [];
  let requests = 0;
  let sent = 0;

  // Judge the spool against the published contract BEFORE any of it goes over the wire. An event
  // the ledger will refuse gains nothing from the round trip: it ends in the dead-letter file
  // either way, just later, remotely, and mixed in with real network failures.
  const preflight = partitionByContract(selected, options.skipContractCheck === true);
  if (preflight.refused.length > 0) {
    rejected.push(...preflight.refused);
    options.onRejected?.(preflight.refused);
    // The checkpoint deliberately does NOT advance past these. They were never sent, so treating
    // them as shipped would be the silent drop this module exists to prevent; they stay pending
    // until the emitter is fixed or the contract is re-vendored.
  }

  const shippable = preflight.passed;
  const byId = new Map(shippable.filter((p) => p.id !== null).map((p) => [p.id as string, p]));

  for (let offset = 0; offset < shippable.length; offset += batchSize) {
    const batch = shippable.slice(offset, offset + batchSize);
    const outcome = await postBatch(batch, options);
    requests += outcome.requests;

    const applied = applyResults(outcome.results, byId, checkpoint);
    checkpoint = applied.checkpoint;
    totals.accepted += applied.accepted;
    totals.duplicate += applied.duplicate;

    if (applied.rejected.length > 0) {
      rejected.push(...applied.rejected);
      // Recorded BEFORE the checkpoint is persisted: advancing past an event
      // nobody wrote down is the silent-drop failure this ordering prevents.
      options.onRejected?.(applied.rejected);
    }
    writeCheckpoint(options.spoolDir, checkpoint);
    sent += batch.length;
  }

  return {
    shipped: totals.accepted + totals.duplicate,
    accepted: totals.accepted,
    duplicate: totals.duplicate,
    rejected,
    // Contract-refused events were never sent, so they are neither shipped nor remaining work the
    // next run can do — they are counted in `rejected` and excluded here, exactly as a
    // ledger-refused event is.
    remaining: pending.length - sent - preflight.refused.length,
    requests,
  };
}

/**
 * Split the spool into what the contract will admit and what it will not.
 *
 * A line that cannot be parsed as JSON is passed THROUGH rather than refused here: `postBatch`
 * ships raw lines and the ledger already judges malformed input, and refusing it locally on a
 * parse error would change an existing, tested behaviour under the guise of adding a check.
 */
function partitionByContract(
  selected: readonly PendingLine[],
  skip: boolean
): { readonly passed: readonly PendingLine[]; readonly refused: readonly RejectedEvent[] } {
  if (skip) return { passed: selected, refused: [] };

  const passed: PendingLine[] = [];
  const refused: RejectedEvent[] = [];

  for (const pending of selected) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(pending.line);
    } catch {
      passed.push(pending);
      continue;
    }
    const verdict = validateAgainstContract(parsed);
    if (verdict.ok) {
      passed.push(pending);
      continue;
    }
    refused.push({
      id: pending.id ?? '(unreadable id)',
      result: 'invalid',
      line: pending.line,
      contractViolations: describeViolations(verdict.violations),
    });
  }

  return { passed, refused };
}

/** What one batch's verdicts did to the tallies and the checkpoint. */
interface AppliedResults {
  readonly checkpoint: ShipCheckpoint;
  readonly accepted: number;
  readonly duplicate: number;
  readonly rejected: readonly RejectedEvent[];
}

/**
 * Fold one batch's per-event verdicts into the checkpoint and the tallies.
 *
 * Pure, and separate from the transport loop, so the rule that actually
 * matters — which verdicts move the mark — can be read on its own instead of
 * being buried inside batching and I/O.
 */
function applyResults(
  results: readonly IngestEventResult[],
  byId: ReadonlyMap<string, PendingLine>,
  start: ShipCheckpoint
): AppliedResults {
  let checkpoint = start;
  let accepted = 0;
  let duplicate = 0;
  const rejected: RejectedEvent[] = [];

  for (const result of results) {
    const pendingLine = byId.get(result.id);
    if (result.result === 'accepted') accepted += 1;
    else if (result.result === 'duplicate') duplicate += 1;
    else {
      rejected.push({ id: result.id, result: result.result, line: pendingLine?.line ?? '' });
    }
    // Landed and terminal both advance: a terminal verdict is final, and
    // leaving the mark behind would re-send it on every future run forever.
    //
    // Stated as an explicit predicate rather than "advance on anything" so a
    // verdict added later — a retryable one, say — does not silently inherit
    // permission to move the mark past an event that never landed.
    const settled = hasLanded(result.result) || isTerminal(result.result);
    if (pendingLine !== undefined && settled) {
      checkpoint = advanceMark(checkpoint, pendingLine.segmentId, result.id);
    }
  }
  return { checkpoint, accepted, duplicate, rejected };
}

/** Count unshipped events without sending anything. */
export function countUnshipped(spoolDir: string): number {
  return collectPending(spoolDir, readCheckpoint(spoolDir)).length;
}
