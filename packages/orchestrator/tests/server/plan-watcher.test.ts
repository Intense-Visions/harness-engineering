import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PlanWatcher } from '../../src/server/plan-watcher';
import { InteractionQueue } from '../../src/core/interaction-queue';

describe('PlanWatcher', () => {
  let plansDir: string;
  let interactionsDir: string;
  let queue: InteractionQueue;
  let watcher: PlanWatcher;

  beforeEach(async () => {
    plansDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-watcher-plans-'));
    interactionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-watcher-int-'));
    queue = new InteractionQueue(interactionsDir);
  });

  afterEach(async () => {
    if (watcher) watcher.stop();
    await fs.rm(plansDir, { recursive: true, force: true });
    await fs.rm(interactionsDir, { recursive: true, force: true });
  });

  it('resolves a pending interaction when a matching plan file is created', async () => {
    // Push an interaction for issue "CORE-42"
    await queue.push({
      id: 'int-core42',
      issueId: 'CORE-42',
      type: 'needs-human',
      reasons: ['full-exploration'],
      context: {
        issueTitle: 'CORE-42: Implement feature',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    watcher = new PlanWatcher(plansDir, queue);
    watcher.start();

    // Create a plan file that matches the issueId
    await fs.writeFile(
      path.join(plansDir, '2026-04-14-CORE-42-feature-plan.md'),
      '# Plan for CORE-42'
    );

    // Wait for the watcher to detect and process
    await new Promise((r) => setTimeout(r, 1500));

    const interactions = await queue.list();
    const resolved = interactions.find((i) => i.id === 'int-core42');
    expect(resolved?.status).toBe('resolved');
  });

  it('does not resolve interactions for non-matching plan files', async () => {
    await queue.push({
      id: 'int-core99',
      issueId: 'CORE-99',
      type: 'needs-human',
      reasons: ['full-exploration'],
      context: {
        issueTitle: 'CORE-99: Other feature',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    watcher = new PlanWatcher(plansDir, queue);
    watcher.start();

    // Create a plan file that does NOT match CORE-99
    await fs.writeFile(
      path.join(plansDir, '2026-04-14-CORE-50-other-plan.md'),
      '# Plan for CORE-50'
    );

    await new Promise((r) => setTimeout(r, 1500));

    const interactions = await queue.list();
    const pending = interactions.find((i) => i.id === 'int-core99');
    expect(pending?.status).toBe('pending');
  });

  it('ignores non-.md files', async () => {
    await queue.push({
      id: 'int-core10',
      issueId: 'CORE-10',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'CORE-10',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    watcher = new PlanWatcher(plansDir, queue);
    watcher.start();

    await fs.writeFile(path.join(plansDir, 'CORE-10-notes.txt'), 'notes');

    await new Promise((r) => setTimeout(r, 1500));

    const interactions = await queue.list();
    expect(interactions.find((i) => i.id === 'int-core10')?.status).toBe('pending');
  });
});
