/**
 * Dead-letter log for permanently-refused events
 * (D4 of `docs/changes/waypoint-spool-shipper/proposal.md`).
 *
 * This file is what makes it safe for the shipper to advance past an event the
 * ledger will never accept. Without it there are only two options and both are
 * defects: block forever on the first bad event, wedging the queue so every
 * later event silently stops shipping; or advance and drop it, which is worse,
 * because a `scrub-rejected` verdict means the scrubber caught something in
 * harness's own exhaust — a signal the adopter needs to see, not a statistic
 * to bury in a counter.
 *
 * Append-only, one JSON object per line, beside the spool it describes.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RejectedEvent } from './shipper';

/** File holding permanently-refused events. */
export const REJECTED_FILENAME = 'rejected.jsonl';

/** One recorded rejection: the verdict, when it happened, and the event. */
export interface RejectedRecord {
  readonly id: string;
  readonly result: string;
  readonly at: string;
  /** The original spooled line, so the event is inspectable, not just named. */
  readonly event: string;
}

export function rejectedLogPath(spoolDir: string): string {
  return join(spoolDir, REJECTED_FILENAME);
}

/**
 * Append rejections to the dead-letter log.
 *
 * Never throws. A shipper that crashed while recording a rejection would leave
 * the run half-applied — some events shipped, no checkpoint written — so an
 * I/O failure here degrades to a returned `false` and the run's own report
 * still names the count.
 */
export function recordRejected(
  spoolDir: string,
  rejected: readonly RejectedEvent[],
  nowIso: string
): boolean {
  if (rejected.length === 0) return true;
  try {
    mkdirSync(spoolDir, { recursive: true });
    const lines = rejected
      .map((r) =>
        JSON.stringify({
          id: r.id,
          result: r.result,
          at: nowIso,
          event: r.line,
        } satisfies RejectedRecord)
      )
      .join('\n');
    appendFileSync(rejectedLogPath(spoolDir), `${lines}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** How many rejections the log holds; 0 when absent or unreadable. */
export function countRejected(spoolDir: string): number {
  const path = rejectedLogPath(spoolDir);
  if (!existsSync(path)) return 0;
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}
