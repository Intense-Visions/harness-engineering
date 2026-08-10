/**
 * The store migration from 7 to 9 columns.
 *
 * `readRecords` used to discard any row without exactly seven fields, so a
 * silent widening would have deleted the entire record store — the same
 * class of failure as the 2026-08-04 write race, but caused by a release
 * rather than a race. These tests pin the deal that makes the widening safe:
 * a legacy row survives, labelled honestly rather than dropped.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { readRecords, writeRecords } from '../src/store';
import type { UsageRecord } from '../src/types';
import { makeHud, type Hud } from './helpers';

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

const LEGACY_ROW = 'legacy\t2026-08-06T00:00:00Z\tclaude-opus-5\t1\t2\t3\t4';

describe('store — 7-to-9 column migration', () => {
  it('loads a legacy 7-column row as pre-migration rather than discarding it', () => {
    // Not `unattributed`: that label means SUBAGENT spend whose identity could
    // not be read, and most legacy rows are the main thread. Mislabelling
    // history would fire the degradation flag on a week that was fine.
    const h = newHud();
    writeFileSync(h.paths.usageTsv, `${LEGACY_ROW}\n`);
    const rec = readRecords(h.paths).get('legacy');
    expect(rec).toBeDefined();
    expect(rec!.agent).toBe('pre-migration');
    expect(rec!.agentId).toBe('');
    expect(rec!.out).toBe(1);
  });

  it('round-trips a 9-column row through write and read', () => {
    const h = newHud();
    const rec: UsageRecord = {
      ts: '2026-08-06T00:00:00Z',
      model: 'claude-opus-5',
      out: 1,
      in: 2,
      cacheWrite: 3,
      cacheRead: 4,
      agent: 'harness-task-executor',
      agentId: 'a6bbff57161b6ebb2',
    };
    writeRecords(h.paths, new Map([['req_1', rec]]));
    expect(readFileSync(h.paths.usageTsv, 'utf8').trim().split('\t')).toHaveLength(9);
    expect(readRecords(h.paths).get('req_1')).toEqual(rec);
  });

  it('loads a row with MORE than nine fields and ignores the extras', () => {
    // Forward tolerance: a future column addition must be survivable by a
    // reader that predates it, the same reversibility the wire contract has.
    const h = newHud();
    writeFileSync(
      h.paths.usageTsv,
      `${LEGACY_ROW}\tharness-task-executor\tlane-1\tsomething-from-the-future\n`
    );
    const rec = readRecords(h.paths).get('legacy')!;
    expect(rec.agent).toBe('harness-task-executor');
    expect(rec.agentId).toBe('lane-1');
  });

  it('still discards a row whose field count is neither 7 nor at least 9', () => {
    const h = newHud();
    writeFileSync(
      h.paths.usageTsv,
      `${[LEGACY_ROW, `${LEGACY_ROW}\teight`, 'short\trow'].join('\n')}\n`
    );
    expect([...readRecords(h.paths).keys()]).toEqual(['legacy']);
  });

  it('never loads an empty agent label', () => {
    // The `never empty` invariant is what every consumer groups on; an empty
    // label would open a nameless bucket nobody reads. A corrupt row falls to
    // `pre-migration` (provenance unknown), never to `unattributed`, which
    // would raise a false "attribution is broken" alarm.
    const h = newHud();
    writeFileSync(h.paths.usageTsv, `${LEGACY_ROW}\t\t\n`);
    expect(readRecords(h.paths).get('legacy')!.agent).toBe('pre-migration');
  });
});

describe('store — sanitising on write', () => {
  it('replaces a tab, CR or LF in a label or lane id with a single space', () => {
    // `usage.tsv` is positional. One stray tab in an undocumented upstream
    // field would shift every later column and make readRecords discard the
    // row — a silent, self-inflicted undercount.
    const h = newHud();
    writeRecords(
      h.paths,
      new Map([
        [
          'req_1',
          {
            ts: '2026-08-06T00:00:00Z',
            model: 'claude-opus-5',
            out: 1,
            in: 0,
            cacheWrite: 0,
            cacheRead: 0,
            agent: 'evil\tagent\nname\r',
            agentId: 'lane\t1',
          },
        ],
      ])
    );

    const row = readFileSync(h.paths.usageTsv, 'utf8').trim();
    expect(row.split('\n')).toHaveLength(1);
    expect(row.split('\t')).toHaveLength(9);

    const rec = readRecords(h.paths).get('req_1')!;
    expect(rec.agent).toBe('evil agent name ');
    expect(rec.agentId).toBe('lane 1');
  });
});
