import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  importLegacyState,
  __resetGenesisMemoForTests,
} from '../../../src/state/event-sourcing/migrate';
import {
  emitEvent,
  loadEvents,
  eventLogPaths,
  resetLocalCountersForTests,
} from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import {
  projectCoreState,
  toHarnessState,
} from '../../../src/state/event-sourcing/projections/core-state';
import { STATE_FILE } from '../../../src/state/state-shared';
import type { HarnessState } from '../../../src/state/types';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esmig-'));
  resetLocalCountersForTests();
  __resetWriterIdForTests();
  __resetGenesisMemoForTests();
});
afterEach(() => {
  __resetGenesisMemoForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function unwrap<T>(p: Promise<{ ok: boolean; value?: T; error?: Error }>): Promise<T> {
  const r = (await p) as { ok: boolean; value: T; error: Error };
  if (!r.ok) throw r.error;
  return r.value;
}

const LEGACY: HarnessState = {
  schemaVersion: 1,
  position: { phase: 'execute', task: 'Task 7' },
  decisions: [
    {
      date: '2026-06-20T00:00:00.000Z',
      decision: 'use event sourcing',
      context: 'harness-planning',
    },
    {
      date: '2026-06-21T00:00:00.000Z',
      decision: 'genesis is idempotent',
      context: 'harness-execution',
    },
  ],
  blockers: [{ id: 'b1', description: 'awaiting review', status: 'open' }],
  progress: { 'Task 1': 'complete', 'Task 7': 'in_progress' },
  lastSession: {
    date: '2026-06-21',
    summary: 'mid cutover',
    lastSkill: 'harness-execution',
    pendingTasks: ['Task 8', 'Task 9'],
  },
};

/** Write a legacy state.json into the resolved state dir for this scope. */
async function writeLegacy(state: HarnessState = LEGACY): Promise<string> {
  const { dir: stateDir } = await eventLogPaths(dir);
  fs.mkdirSync(stateDir, { recursive: true });
  const p = path.join(stateDir, STATE_FILE);
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
  return p;
}

describe('importLegacyState — D6 genesis migration', () => {
  it('(a) imports once: emits exactly one state_imported capturing the legacy file verbatim', async () => {
    await writeLegacy();
    const r = await importLegacyState(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported).toBe(true);

    const events = await unwrap(loadEvents(dir));
    const imports = events.filter((e) => e.type === 'state_imported');
    expect(imports.length).toBe(1);
    expect((imports[0] as { payload: { legacyState: unknown } }).payload.legacyState).toEqual(
      LEGACY
    );

    // The projection round-trips the legacy contents faithfully.
    const hs = toHarnessState(projectCoreState(events));
    expect(hs).toEqual(LEGACY);
  });

  it('(b) idempotent re-run: a second call appends nothing', async () => {
    await writeLegacy();
    await importLegacyState(dir);
    __resetGenesisMemoForTests(); // force the on-disk idempotency check, not the process memo
    const r2 = await importLegacyState(dir);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.imported).toBe(false);
    const events = await unwrap(loadEvents(dir));
    expect(events.filter((e) => e.type === 'state_imported').length).toBe(1);
  });

  it('(c) idempotent on the event, not the file: genesis present + legacy file still there → no-op', async () => {
    // Crash-after-emit-before-rename: a state_imported is already in the log AND the legacy file lingers.
    await emitEvent(dir, { type: 'state_imported', payload: { legacyState: { ...LEGACY } } });
    await writeLegacy(); // legacy file still present (rename never happened)
    __resetGenesisMemoForTests();

    const r = await importLegacyState(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported).toBe(false);
    const events = await unwrap(loadEvents(dir));
    expect(events.filter((e) => e.type === 'state_imported').length).toBe(1);
  });

  it('(d) crash-after-empty: an empty log left by a crashed import still imports', async () => {
    const { dir: stateDir, logPath } = await eventLogPaths(dir);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(logPath, ''); // empty log file present, no state_imported yet
    await writeLegacy();

    const r = await importLegacyState(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported).toBe(true);
    const events = await unwrap(loadEvents(dir));
    expect(events.filter((e) => e.type === 'state_imported').length).toBe(1);
  });

  it('(e) no legacy file: no-op, emits no event, does not throw', async () => {
    const r = await importLegacyState(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported).toBe(false);
    const events = await unwrap(loadEvents(dir));
    expect(events.length).toBe(0);
  });

  it('(f) rename: the legacy file is renamed to state.json.imported on success', async () => {
    const legacyPath = await writeLegacy();
    await importLegacyState(dir);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(`${legacyPath}.imported`)).toBe(true);
  });

  it('(f) a failed rename is non-fatal: the event is still authoritative', async () => {
    const legacyPath = await writeLegacy();
    // Force renameSync to throw by pre-creating the destination as a non-empty directory.
    fs.mkdirSync(`${legacyPath}.imported`, { recursive: true });
    fs.writeFileSync(path.join(`${legacyPath}.imported`, 'blocker.txt'), 'x');

    const r = await importLegacyState(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported).toBe(true); // import succeeded despite rename failure
    const events = await unwrap(loadEvents(dir));
    expect(events.filter((e) => e.type === 'state_imported').length).toBe(1);
  });

  it('(invalid legacy) an unparseable legacy file is not imported and does not throw', async () => {
    const { dir: stateDir } = await eventLogPaths(dir);
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, STATE_FILE), '{ not valid json');
    const r = await importLegacyState(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.imported).toBe(false);
    expect((await unwrap(loadEvents(dir))).length).toBe(0);
  });
});
