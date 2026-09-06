import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { InteractionQueue } from '../../src/core/interaction-queue';
import type { PendingInteraction } from '../../src/core/interaction-queue';

function makeInteraction(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration tier always requires human'],
    context: {
      issueTitle: 'Needs a human',
      issueDescription: null,
      specPath: null,
      planPath: null,
      relatedFiles: [],
    },
    createdAt: '2026-01-01T00:00:00Z',
    status: 'pending',
    ...overrides,
  };
}

describe('InteractionQueue.list with an entry that disappears mid-scan', () => {
  let tmpDir: string;
  let queue: InteractionQueue;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bugfleet-iq-'));
    queue = new InteractionQueue(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * `list()` reads the directory, then reads every `*.json` entry inside ONE
   * try/catch whose ENOENT branch returns `[]`. So a single entry that is
   * listed by `readdir` but gone by the time `readFile` reaches it does not
   * merely get skipped — it discards every interaction already read and
   * reports the queue as EMPTY.
   *
   * A file vanishing between `readdir` and `readFile` is exactly what a reader
   * observes when `push()` (which unlinks the superseded pending file for an
   * issue) interleaves with it. Here that same ENOENT is produced
   * deterministically with a dangling symlink instead of a scheduled race.
   */
  async function seedSurvivorPlusVanishedEntry(): Promise<void> {
    await queue.push(makeInteraction({ id: 'int-live', issueId: 'issue-live' }));
    await fs.symlink(path.join(tmpDir, 'gone.json'), path.join(tmpDir, 'int-vanished.json'));
  }

  it('still returns the interactions it successfully read', async () => {
    await seedSurvivorPlusVanishedEntry();

    const result = await queue.list();

    expect(result.map((i) => i.id)).toEqual(['int-live']);
  });

  it('still reports the surviving pending escalation via listPending', async () => {
    await seedSurvivorPlusVanishedEntry();

    const pending = await queue.listPending();

    expect(pending).toHaveLength(1);
  });
});
