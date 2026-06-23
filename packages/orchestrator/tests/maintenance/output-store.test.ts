import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TaskOutputStore } from '../../src/maintenance/output-store';
import type { PersistedOutputEntry } from '../../src/maintenance/output-store';

function makeEntry(
  taskId: string,
  completedAt: string,
  overrides: Partial<PersistedOutputEntry> = {}
): PersistedOutputEntry {
  return {
    taskId,
    startedAt: completedAt,
    completedAt,
    status: 'success',
    findings: 0,
    fixed: 0,
    prUrl: null,
    prUpdated: false,
    origin: 'cron',
    ...overrides,
  };
}

describe('TaskOutputStore', () => {
  let rootDir: string;
  let store: TaskOutputStore;

  beforeEach(async () => {
    // Freeze the clock to the era of the fixtures below. The default store's
    // age-based retention (maxAgeDays: 30) prunes entries relative to "now",
    // so absolute fixture dates would otherwise age out and be deleted on
    // write once the wall clock drifts > 30 days past them (time-bomb).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T16:00:00.000Z'));
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'output-store-'));
    store = new TaskOutputStore({ rootDir });
  });

  afterEach(async () => {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('writes a run and reads it back via latest()', async () => {
    const entry = makeEntry('my-task', '2026-05-17T14:00:00.000Z', {
      stdout: 'hello world',
      findings: 3,
    });
    await store.write('my-task', entry);
    const latest = await store.latest('my-task');
    expect(latest?.completedAt).toBe('2026-05-17T14:00:00.000Z');
    expect(latest?.stdout).toBe('hello world');
    expect(latest?.findings).toBe(3);
  });

  it('returns null from latest() when no runs exist', async () => {
    const latest = await store.latest('never-run');
    expect(latest).toBeNull();
  });

  it('lists entries newest-first with offset/limit', async () => {
    for (let i = 0; i < 5; i++) {
      const iso = `2026-05-17T1${i}:00:00.000Z`;
      await store.write('multi', makeEntry('multi', iso));
    }
    const all = await store.list('multi', 10, 0);
    expect(all.length).toBe(5);
    expect(all[0]?.completedAt).toBe('2026-05-17T14:00:00.000Z');
    expect(all[4]?.completedAt).toBe('2026-05-17T10:00:00.000Z');

    const page = await store.list('multi', 2, 1);
    expect(page.length).toBe(2);
    expect(page[0]?.completedAt).toBe('2026-05-17T13:00:00.000Z');
  });

  it('enforces last-N retention', async () => {
    const custom = new TaskOutputStore({
      rootDir,
      retentionDefaults: { runs: 3, maxAgeDays: 365 },
    });
    for (let i = 0; i < 6; i++) {
      const iso = `2026-05-17T1${i}:00:00.000Z`;
      await custom.write('many', makeEntry('many', iso));
    }
    const entries = await custom.list('many', 100, 0);
    expect(entries.length).toBe(3);
    expect(entries.map((e) => e.completedAt)).toEqual([
      '2026-05-17T15:00:00.000Z',
      '2026-05-17T14:00:00.000Z',
      '2026-05-17T13:00:00.000Z',
    ]);
  });

  it('enforces maxAgeDays retention', async () => {
    const custom = new TaskOutputStore({
      rootDir,
      retentionDefaults: { runs: 100, maxAgeDays: 1 },
    });
    const oldEntry = makeEntry(
      'aged',
      new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    );
    const recentEntry = makeEntry('aged', new Date().toISOString());
    // Write old first, then recent — recent triggers retention pruning
    await custom.write('aged', oldEntry);
    await custom.write('aged', recentEntry);
    const entries = await custom.list('aged', 100, 0);
    expect(entries.length).toBe(1);
    expect(entries[0]?.completedAt).toBe(recentEntry.completedAt);
  });

  it('applies per-task retention override', async () => {
    for (let i = 0; i < 6; i++) {
      const iso = `2026-05-17T1${i}:00:00.000Z`;
      await store.write('override', makeEntry('override', iso), { runs: 2, maxAgeDays: 365 });
    }
    const entries = await store.list('override', 100, 0);
    expect(entries.length).toBe(2);
  });

  it('retrieves a specific run by ID', async () => {
    const iso = '2026-05-17T14:00:00.000Z';
    await store.write('one', makeEntry('one', iso, { findings: 7 }));
    const got = await store.get('one', iso);
    expect(got?.findings).toBe(7);
  });

  it('returns null for an unknown run ID', async () => {
    const got = await store.get('missing-task', '2026-05-17T14:00:00.000Z');
    expect(got).toBeNull();
  });

  it('rejects task IDs with path-traversal segments', async () => {
    await expect(
      store.write('../etc', makeEntry('../etc', '2026-05-17T14:00:00.000Z'))
    ).rejects.toThrow(/invalid task id/i);
    await expect(store.list('../etc', 10, 0)).rejects.toThrow(/invalid task id/i);
    await expect(store.get('valid', '../etc/passwd')).rejects.toThrow(/must not contain/i);
  });

  it('survives a corrupt entry by skipping it', async () => {
    const iso = '2026-05-17T14:00:00.000Z';
    await store.write('corrupt', makeEntry('corrupt', iso));
    // overwrite the file with malformed JSON
    const dir = store.dirFor('corrupt');
    const files = await fs.promises.readdir(dir);
    const target = path.join(dir, files[0]!);
    await fs.promises.writeFile(target, '{not valid json', 'utf-8');
    const entries = await store.list('corrupt', 100, 0);
    expect(entries.length).toBe(0);
  });
});
