import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readHumanDecisionBlockers, type HandoffFs } from './human-decision-blockers';

const WS = '/ws';
const SESSIONS = join(WS, '.harness', 'sessions');

function fakeFs(files: Record<string, { body: string; mtimeMs?: number }>): HandoffFs {
  return {
    readdir: (dir) => {
      if (dir !== SESSIONS) throw new Error('ENOENT');
      return [
        ...new Set(Object.keys(files).map((f) => f.slice(SESSIONS.length + 1).split('/')[0]!)),
      ];
    },
    readFile: (file) => {
      const f = files[file];
      if (!f) throw new Error('ENOENT');
      return f.body;
    },
    mtimeMs: (file) => {
      const f = files[file];
      if (!f) throw new Error('ENOENT');
      return f.mtimeMs ?? 1000;
    },
  };
}

const handoff = (slug: string) => join(SESSIONS, slug, 'handoff.json');
const blockersOnly = (ws: string, since: number, fs: HandoffFs) =>
  readHumanDecisionBlockers(ws, since, fs).blockers;

describe('readHumanDecisionBlockers', () => {
  it('returns only audit-disagreement and judgment-fork blockers, across sessions, in slug order', () => {
    const fs = fakeFs({
      [handoff('b')]: { body: JSON.stringify({ blockers: ['audit-disagreement: two'] }) },
      [handoff('a')]: {
        body: JSON.stringify({
          blockers: ['flaky test', 'audit-disagreement: one', 7, 'judgment-fork: three'],
        }),
      },
    });
    expect(blockersOnly(WS, 0, fs)).toEqual([
      'audit-disagreement: one',
      'judgment-fork: three',
      'audit-disagreement: two',
    ]);
  });

  it('ignores handoffs written before the dispatch started', () => {
    const fs = fakeFs({
      [handoff('a')]: {
        body: JSON.stringify({ blockers: ['audit-disagreement: stale'] }),
        mtimeMs: 10,
      },
    });
    expect(blockersOnly(WS, 11, fs)).toEqual([]);
    expect(blockersOnly(WS, 10, fs)).toEqual(['audit-disagreement: stale']);
  });

  it('yields nothing for a missing sessions dir, malformed JSON, or non-array blockers', () => {
    expect(blockersOnly(WS, 0, fakeFs({}))).toEqual([]);
    const fs = fakeFs({
      [handoff('a')]: { body: '{not json' },
      [handoff('b')]: { body: JSON.stringify({ blockers: 'audit-disagreement: x' }) },
      [handoff('c')]: { body: 'null' },
    });
    expect(blockersOnly(WS, 0, fs)).toEqual([]);
  });

  it('also reads stream and global handoffs, and carries the matching handoff concerns', () => {
    const files: Record<string, { body: string }> = {
      [join(WS, '.harness', 'streams', 's1', 'handoff.json')]: {
        body: JSON.stringify({
          blockers: ['judgment-fork: stream'],
          concerns: ['options: A, B; recommend A'],
        }),
      },
      [join(WS, '.harness', 'handoff.json')]: {
        body: JSON.stringify({ blockers: ['audit-disagreement: global'] }),
      },
      [handoff('quiet')]: {
        body: JSON.stringify({ blockers: ['flaky'], concerns: ['not ours'] }),
      },
    };
    const fs: HandoffFs = {
      readdir: (dir) => {
        const kids = Object.keys(files)
          .filter((f) => f.startsWith(dir + '/') && f.slice(dir.length + 1).includes('/'))
          .map((f) => f.slice(dir.length + 1).split('/')[0]!);
        if (kids.length === 0) throw new Error('ENOENT');
        return [...new Set(kids)];
      },
      readFile: (f) => {
        if (!files[f]) throw new Error('ENOENT');
        return files[f]!.body;
      },
      mtimeMs: (f) => {
        if (!files[f]) throw new Error('ENOENT');
        return 1000;
      },
    };
    expect(readHumanDecisionBlockers(WS, 0, fs)).toEqual({
      blockers: ['judgment-fork: stream', 'audit-disagreement: global'],
      concerns: ['options: A, B; recommend A'],
    });
  });
});
