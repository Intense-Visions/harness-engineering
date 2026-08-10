/**
 * Locking and atomic writes only mean something across processes, so these
 * drive the built binary in real subprocesses rather than calling the library.
 *
 * The failure being guarded: scans fire from the SessionStart hook, the Stop
 * hook and the CLI while several Claude sessions run at once. Two overlapping
 * scans both read the record store and then both rewrite it, so the loser's
 * write lands a partial file — which is how 85% of the store was lost on
 * 2026-08-04 while the HUD kept reporting a comfortable green.
 */
import { existsSync, readFileSync } from 'node:fs';

import { afterEach, beforeAll, expect, it } from 'vitest';

import { BIN, DEFAULT_WEEK, hoursAgo, makeHud, runBin, transcriptLine, type Hud } from './helpers';

let hud: Hud | null = null;

beforeAll(() => {
  if (!existsSync(BIN)) {
    throw new Error(`built binary missing at ${BIN} — run \`pnpm build\` first`);
  }
});

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

it('leaves a consistent store after six concurrent scans', async () => {
  hud = makeHud();
  const now = new Date();
  hud.writeConfig({ week_reset: DEFAULT_WEEK });
  hud.writeTranscript(
    'a.jsonl',
    Array.from({ length: 200 }, (_, i) => transcriptLine(`r${i}`, hoursAgo(now, 1)))
  );

  const results = await Promise.all(Array.from({ length: 6 }, () => runBin(['scan'], hud!.env)));
  for (const r of results) {
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
  }

  const rows = readFileSync(hud.paths.usageTsv, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  expect(rows).toHaveLength(200);
  for (const row of rows) {
    expect(row.split('\t')).toHaveLength(9); // no partial rows
  }

  const header = readFileSync(hud.paths.filesTsv, 'utf8').split('\n')[0];
  expect(header).toBe(`#count\t${rows.length}`);
});
