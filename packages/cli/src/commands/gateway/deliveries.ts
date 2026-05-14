import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { WebhookQueue } from '@harness-engineering/orchestrator';
import type { QueueRow } from '@harness-engineering/orchestrator';

/**
 * Resolve the SQLite path the same way the orchestrator does
 * (env var override → `.harness/webhook-queue.sqlite` under CWD).
 *
 * The CLI opens the DB directly and operates on it without going through the
 * orchestrator's HTTP API. This is intentional: ops need a recovery path when
 * the orchestrator is down (e.g. inspecting/purging the DLQ during an
 * incident).
 */
function resolveQueuePath(): string {
  return process.env['HARNESS_WEBHOOK_QUEUE_PATH'] ?? resolve('.harness', 'webhook-queue.sqlite');
}

function getQueue(): WebhookQueue {
  return new WebhookQueue(resolveQueuePath());
}

// Thin runner functions — exported for testability so the test suite can
// drive list/retry/purge against an in-process WebhookQueue without spawning
// the commander parser.
export function runDeliveriesList(
  queue: WebhookQueue,
  filter: { status?: string; subscriptionId?: string }
): QueueRow[] {
  return queue.list(filter);
}

export function runDeliveriesRetry(queue: WebhookQueue, id: string): boolean {
  return queue.retryDead(id);
}

export interface PurgeOptions {
  deadOnly?: boolean;
  olderThanMs?: number;
  all?: boolean;
}

export interface PurgeRunOptions {
  /**
   * Confirmation callback. Receives the number of rows that would be deleted
   * and returns true to proceed, false to abort. When omitted, the runner
   * proceeds without prompting (CI / non-TTY default).
   */
  confirm?: (count: number) => boolean | Promise<boolean>;
  /** Stream to write errors / preview text to. Defaults to process.stderr. */
  errOut?: NodeJS.WritableStream;
}

/**
 * Purge runner with two safety rails:
 *   1. At least one of --dead-only / --older-than / --all MUST be set; an
 *      unbounded purge silently wiping every row was C2 in code review.
 *   2. When run on a TTY the caller-supplied `confirm` callback gates the
 *      delete with a row-count preview. Non-TTY scripts skip the prompt by
 *      passing no confirm.
 *
 * Returns the number of rows deleted, or -1 when the runner refused to act
 * (missing filter or confirmation declined). The CLI command sets
 * process.exitCode = 1 on -1.
 */
export async function runDeliveriesPurge(
  queue: WebhookQueue,
  opts: PurgeOptions,
  runOpts: PurgeRunOptions = {}
): Promise<number> {
  const errOut = runOpts.errOut ?? process.stderr;
  if (!opts.deadOnly && opts.olderThanMs === undefined && !opts.all) {
    errOut.write('purge requires one of: --dead-only, --older-than <ms>, --all\n');
    return -1;
  }
  if (runOpts.confirm) {
    const count = queue.previewPurge(opts);
    const ok = await runOpts.confirm(count);
    if (!ok) return -1;
  }
  return queue.purge(opts);
}

function promptYesNo(message: string): Promise<boolean> {
  return new Promise((resolveAns) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolveAns(a === 'y' || a === 'yes');
    });
  });
}

export function createDeliveriesCommand(): Command {
  const cmd = new Command('deliveries').description('Inspect and manage webhook delivery queue');

  cmd
    .command('list')
    .description('List delivery queue entries (newest first; capped at 200 rows)')
    .option('--status <status>', 'Filter by status: pending|failed|delivered|dead')
    .option('--subscription <id>', 'Filter by subscription ID')
    .action((opts: { status?: string; subscription?: string }) => {
      const queue = getQueue();
      try {
        const filter: { status?: string; subscriptionId?: string } = {};
        if (opts.status) filter.status = opts.status;
        if (opts.subscription) filter.subscriptionId = opts.subscription;
        const rows = runDeliveriesList(queue, filter);
        console.log(JSON.stringify(rows, null, 2));
      } finally {
        queue.close();
      }
    });

  cmd
    .command('retry <id>')
    .description('Re-enqueue a dead-lettered delivery by ID')
    .action((id: string) => {
      const queue = getQueue();
      try {
        const ok = runDeliveriesRetry(queue, id);
        if (ok) {
          console.log(`Delivery ${id} re-enqueued.`);
        } else {
          console.error(`Delivery ${id} not found or not in dead status.`);
          process.exitCode = 1;
        }
      } finally {
        queue.close();
      }
    });

  cmd
    .command('purge')
    .description('Delete delivery rows from the queue (requires at least one filter)')
    .option('--dead-only', 'Delete only dead-lettered rows')
    .option('--older-than <ms>', 'Delete delivered rows older than N milliseconds')
    .option('--all', 'Delete every row in the queue (use with caution)')
    .action(async (opts: { deadOnly?: boolean; olderThan?: string; all?: boolean }) => {
      const queue = getQueue();
      try {
        const purgeOpts: PurgeOptions = {};
        if (opts.deadOnly) purgeOpts.deadOnly = true;
        if (opts.olderThan !== undefined) purgeOpts.olderThanMs = Number(opts.olderThan);
        if (opts.all) purgeOpts.all = true;

        const isTty = Boolean(process.stdout.isTTY);
        const runOpts: PurgeRunOptions = {};
        if (isTty) {
          runOpts.confirm = (count) => {
            if (count === 0) {
              console.log('No matching rows to delete.');
              return false;
            }
            return promptYesNo(`Delete ${count} row(s)? [y/N] `);
          };
        }
        const result = await runDeliveriesPurge(queue, purgeOpts, runOpts);
        if (result === -1) {
          process.exitCode = 1;
          return;
        }
        console.log(`Deleted ${result} row(s).`);
      } finally {
        queue.close();
      }
    });

  return cmd;
}
