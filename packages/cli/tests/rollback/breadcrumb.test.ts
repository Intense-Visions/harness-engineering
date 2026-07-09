import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendRollbackEvent,
  linkRollbackEventToGraph,
  ROLLBACK_EVENTS_FILE,
} from '../../src/rollback/breadcrumb';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rb-crumb-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('appendRollbackEvent', () => {
  it('appends exactly one JSONL record with the required fields (SC4)', async () => {
    await appendRollbackEvent(
      {
        targetPr: 42,
        trigger: 'signal',
        revertReady: true,
        action: 'proposed',
        prUrl: 'https://gh/pr/99',
      },
      { root }
    );
    const file = join(root, ROLLBACK_EVENTS_FILE);
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]!);
    expect(rec).toMatchObject({
      targetPr: 42,
      trigger: 'signal',
      revertReady: true,
      action: 'proposed',
      prUrl: 'https://gh/pr/99',
    });
    expect(typeof rec.ts).toBe('string');
  });

  it('appends (not overwrites) on a second call', async () => {
    const ev = {
      targetPr: 1,
      trigger: 'signal' as const,
      revertReady: false,
      action: 'skipped' as const,
    };
    await appendRollbackEvent(ev, { root });
    await appendRollbackEvent({ ...ev, targetPr: 2 }, { root });
    const lines = readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('linkRollbackEventToGraph', () => {
  it('graph link is a degrade-safe no-op when no graph exists', async () => {
    await expect(
      linkRollbackEventToGraph(
        { targetPr: 1, trigger: 'signal', revertReady: true, action: 'proposed' },
        { root }
      )
    ).resolves.toBeUndefined();
  });
});
