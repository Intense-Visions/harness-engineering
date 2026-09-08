import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookQueue, MAX_ATTEMPTS } from '@harness-engineering/orchestrator';

// readline mock so the TTY confirm path can auto-answer without real stdin.
let readlineAnswer = 'n';
vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (_msg: string, cb: (a: string) => void) => cb(readlineAnswer),
    close: () => {},
  }),
}));

import { createDeliveriesCommand } from '../../../src/commands/gateway/deliveries';

let dir: string;
let dbPath: string;
let logOutput: string[];
let errOutput: string[];

const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  errOutput.push(a.map(String).join(' '));
});

function seed(): void {
  const q = new WebhookQueue(dbPath);
  q.insert({ id: 'dlv_0000000000000001', subscriptionId: 'whk_a', eventType: 'x', payload: '{}' });
  q.insert({ id: 'dlv_0000000000000002', subscriptionId: 'whk_b', eventType: 'x', payload: '{}' });
  q.markFailed('dlv_0000000000000001', MAX_ATTEMPTS, Date.now(), 'err');
  q.close();
}

function run(args: string[]): Promise<unknown> {
  const cmd = createDeliveriesCommand();
  cmd.exitOverride();
  return cmd.parseAsync(args, { from: 'user' });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-dlv-cov544b-'));
  dbPath = join(dir, 'test.sqlite');
  process.env['HARNESS_WEBHOOK_QUEUE_PATH'] = dbPath;
  logOutput = [];
  errOutput = [];
  readlineAnswer = 'n';
});

afterEach(() => {
  delete process.env['HARNESS_WEBHOOK_QUEUE_PATH'];
  rmSync(dir, { recursive: true, force: true });
  process.exitCode = 0;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
});

describe('deliveries command wiring (cov544b)', () => {
  it('list prints all rows as JSON', async () => {
    seed();
    await run(['list']);
    const rows = JSON.parse(logOutput.join('\n')) as { id: string }[];
    expect(rows).toHaveLength(2);
  });

  it('list applies --status and --subscription filters', async () => {
    seed();
    await run(['list', '--status', 'dead', '--subscription', 'whk_a']);
    const rows = JSON.parse(logOutput.join('\n')) as { id: string; status: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('dead');
  });

  it('retry re-enqueues a dead row', async () => {
    seed();
    await run(['retry', 'dlv_0000000000000001']);
    expect(logOutput.join('\n')).toContain('re-enqueued');
  });

  it('retry on a missing/non-dead row logs an error and sets exitCode 1', async () => {
    seed();
    await run(['retry', 'dlv_0000000000000002']);
    expect(errOutput.join('\n')).toContain('not found or not in dead status');
    expect(process.exitCode).toBe(1);
  });

  it('purge with no filter refuses and sets exitCode 1', async () => {
    seed();
    const isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    try {
      await run(['purge']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
    }
    expect(process.exitCode).toBe(1);
  });

  it('purge --all deletes every row (non-TTY skips confirm)', async () => {
    seed();
    const isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    try {
      await run(['purge', '--all']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
    }
    expect(logOutput.join('\n')).toContain('Deleted 2 row(s).');
  });

  it('purge --older-than builds an olderThanMs option', async () => {
    seed();
    const isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    try {
      await run(['purge', '--older-than', '0']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
    }
    // olderThan 0 deletes nothing delivered; the branch is exercised regardless.
    expect(logOutput.join('\n')).toContain('Deleted');
  });

  it('TTY purge with confirm=yes deletes rows via the readline prompt', async () => {
    seed();
    readlineAnswer = 'y';
    const isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      await run(['purge', '--dead-only']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
    }
    expect(logOutput.join('\n')).toContain('Deleted 1 row(s).');
  });

  it('TTY purge with confirm=no aborts and sets exitCode 1', async () => {
    seed();
    readlineAnswer = 'n';
    const isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      await run(['purge', '--dead-only']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
    }
    expect(process.exitCode).toBe(1);
  });

  it('TTY purge with zero matching rows prints the no-rows notice and aborts', async () => {
    // empty DB → previewPurge returns 0 → ttyPurgeConfirm short-circuits.
    const isTty = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      await run(['purge', '--dead-only']);
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
    }
    expect(logOutput.join('\n')).toContain('No matching rows to delete.');
    expect(process.exitCode).toBe(1);
  });
});
