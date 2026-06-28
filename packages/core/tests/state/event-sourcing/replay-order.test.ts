import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadEvents, eventLogPaths } from '../../../src/state/event-sourcing/log';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esreplay-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SC3 deterministic replay order', () => {
  it('produces an identical (seq asc, writerId asc) order across repeated loads, with writerId tiebreak', async () => {
    const { logPath } = await eventLogPaths(dir);
    // Same seq, different writerIds → tiebreak must be deterministic. Shuffled on disk.
    const lines = [
      {
        seq: 3,
        writerId: 'm',
        timestamp: 'z',
        scope: {},
        type: 'position_set',
        payload: { phase: 'c' },
      },
      {
        seq: 1,
        writerId: 'z',
        timestamp: 'a',
        scope: {},
        type: 'position_set',
        payload: { phase: 'a' },
      },
      {
        seq: 2,
        writerId: 'b',
        timestamp: 'y',
        scope: {},
        type: 'position_set',
        payload: { phase: 'b1' },
      },
      {
        seq: 2,
        writerId: 'a',
        timestamp: 'x',
        scope: {},
        type: 'position_set',
        payload: { phase: 'b2' },
      },
    ];
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

    const order1 = await loadEvents(dir);
    const order2 = await loadEvents(dir);
    expect(order1.ok && order2.ok).toBe(true);
    if (!order1.ok || !order2.ok) return;

    const keys1 = order1.value.map((e) => `${e.seq}|${e.writerId}`);
    expect(keys1).toEqual(['1|z', '2|a', '2|b', '3|m']);
    expect(order1.value.map((e) => `${e.seq}|${e.writerId}`)).toEqual(
      order2.value.map((e) => `${e.seq}|${e.writerId}`)
    );
  });
});
