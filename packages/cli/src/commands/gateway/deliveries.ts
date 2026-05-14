import { Command } from 'commander';
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

export function runDeliveriesPurge(
  queue: WebhookQueue,
  opts: { deadOnly?: boolean; olderThanMs?: number }
): number {
  return queue.purge(opts);
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
    .description('Delete delivery rows from the queue')
    .option('--dead-only', 'Delete only dead-lettered rows')
    .option('--older-than <ms>', 'Delete delivered rows older than N milliseconds')
    .action((opts: { deadOnly?: boolean; olderThan?: string }) => {
      const queue = getQueue();
      try {
        const purgeOpts: { deadOnly?: boolean; olderThanMs?: number } = {};
        if (opts.deadOnly) purgeOpts.deadOnly = true;
        if (opts.olderThan !== undefined) purgeOpts.olderThanMs = Number(opts.olderThan);
        const count = runDeliveriesPurge(queue, purgeOpts);
        console.log(`Deleted ${count} row(s).`);
      } finally {
        queue.close();
      }
    });

  return cmd;
}
