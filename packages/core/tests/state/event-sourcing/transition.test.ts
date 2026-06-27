import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { registerTask } from '../../../src/state/event-sourcing/transition';
import { loadEvents, resetLocalCountersForTests } from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import { projectLanes } from '../../../src/state/event-sourcing/projections/lanes';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estrans-'));
  resetLocalCountersForTests();
  __resetWriterIdForTests();
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function unwrap<T>(p: Promise<{ ok: boolean; value?: T; error?: Error }>): Promise<T> {
  const r = (await p) as { ok: boolean; value: T; error: Error };
  if (!r.ok) throw r.error;
  return r.value;
}

describe('registerTask', () => {
  it('emits task_registered; projectLanes shows the task at planned', async () => {
    const r = await registerTask(dir, 't1', ['t0']);
    expect(r.ok).toBe(true);
    const events = await unwrap(loadEvents(dir));
    const lanes = projectLanes(events);
    expect(lanes.tasks.t1).toMatchObject({ lane: 'planned', dependsOn: ['t0'] });
  });
});
