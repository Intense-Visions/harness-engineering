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
    expect(readHumanDecisionBlockers(WS, 0, fs)).toEqual([
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
    expect(readHumanDecisionBlockers(WS, 11, fs)).toEqual([]);
    expect(readHumanDecisionBlockers(WS, 10, fs)).toEqual(['audit-disagreement: stale']);
  });

  it('yields nothing for a missing sessions dir, malformed JSON, or non-array blockers', () => {
    expect(readHumanDecisionBlockers(WS, 0, fakeFs({}))).toEqual([]);
    const fs = fakeFs({
      [handoff('a')]: { body: '{not json' },
      [handoff('b')]: { body: JSON.stringify({ blockers: 'audit-disagreement: x' }) },
      [handoff('c')]: { body: 'null' },
    });
    expect(readHumanDecisionBlockers(WS, 0, fs)).toEqual([]);
  });
});
