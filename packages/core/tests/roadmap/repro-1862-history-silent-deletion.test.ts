import { describe, it, expect } from 'vitest';
import { parseAssignmentHistory } from '../../src/roadmap/assignment-history';
import { regenerate, writeRegeneratedRoadmap } from '../../src/roadmap/store/regenerator';
import type { ShardIO } from '../../src/roadmap/store/shard-store';

// Reproduction for #1862: `harness roadmap regen` silently deletes the whole
// `## Assignment History` section — 92 committed lines — at exit 0.
//
// `parseAssignmentHistory` answered `Ok([])` for two states a caller must be able
// to tell apart:
//
//   1. the document has no `## Assignment History` heading at all — legitimately
//      empty history, and the correct answer is `[]`;
//   2. the heading IS there, carrying records, and the parser could not read a
//      single one of them.
//
// State 2 is what a format migration produces. #1859/#1811 moved history off the
// pipe table onto `- **Key:** value` bullet blocks; a parser built before that
// migration reads the new shape as zero records. `serializeRoadmap` then omits the
// section (`serialize.ts`, "omit if empty") — and because the empty parse is
// indistinguishable from an empty history, the omission reads as correct output.
// Exit 0, a success banner, and the section is gone.
//
// The fix makes the two states distinguishable: an absent heading still yields
// `Ok([])`, but a heading whose content yielded no records is an `Err`, and the
// regen path — which already returns before writing on a failed parse — refuses
// to write the truncated document instead of reporting success.
//
// At the pinned base SHA every test here FAILS by ASSERTION (the parse reports a
// successful empty history, and regen happily writes the deletion), not by a
// compile or resolution error.

/** A history section in a grammar this parser cannot read — the migration case. */
const UNREADABLE_HISTORY = [
  '## Assignment History',
  '',
  '- Core foundation :: alice :: assigned :: 2026-01-02',
  '- Core foundation :: bob :: unassigned :: 2026-01-03',
].join('\n');

/**
 * The same shape the real defect took: a legacy pipe table whose separator row is
 * missing. The legacy reader treats a separator-less table as header-only and
 * returns zero records, so four lines of real history read as an empty history.
 */
const SEPARATORLESS_LEGACY_HISTORY = [
  '## Assignment History',
  '| Feature | Assignee | Action | Date |',
  '| Core foundation | alice | assigned | 2026-01-02 |',
  '| Core foundation | bob | unassigned | 2026-01-03 |',
].join('\n');

describe('#1862 parseAssignmentHistory distinguishes "absent" from "unreadable"', () => {
  it('fails loudly when the heading is present but no record could be read', () => {
    const result = parseAssignmentHistory(UNREADABLE_HISTORY);

    // The whole point: this must NOT be a successful empty history, because a
    // write derived from it deletes the section.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The message has to name the section, or the operator cannot act on it.
    expect(result.error.message).toContain('## Assignment History');
  });

  it('fails loudly on a separator-less legacy table rather than reading it as empty', () => {
    const result = parseAssignmentHistory(SEPARATORLESS_LEGACY_HISTORY);

    expect(result.ok).toBe(false);
  });

  it('still reports an empty history when the document has no heading at all', () => {
    // A roadmap that never had an assignment history must keep working, byte for
    // byte — this is the state the `Err` must not swallow.
    const result = parseAssignmentHistory('# Roadmap\n\n## MVP Release\n');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });
});

// --- The end-to-end deletion the issue actually reported ------------------------

const SHARD_DIR = '/repo/docs/roadmap.d';
const ROADMAP_PATH = '/repo/docs/roadmap.md';

const META_WITH_UNREADABLE_HISTORY = `---
project: "harness-engineering"
version: 1
last_synced: "2026-06-27T12:00:00.000Z"
last_manual_edit: "2026-06-27T11:00:00.000Z"
milestones:
  - "MVP Release"
---

${UNREADABLE_HISTORY}
`;

const SHARD_MD = `---
slug: core-foundation
milestone: MVP Release
order: 1
---

### Core foundation

- **Status:** done
- **Owner:** platform
- **Summary:** The foundation.
- **Blockers:** —
- **Plan:** —
`;

function makeShardIO() {
  const files = new Map<string, string>([
    [`${SHARD_DIR}/_meta.md`, META_WITH_UNREADABLE_HISTORY],
    [`${SHARD_DIR}/core-foundation.md`, SHARD_MD],
  ]);
  const writes: string[] = [];
  const io: ShardIO = {
    listDir: async (dir) =>
      [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`))
        .map((p) => p.slice(p.lastIndexOf('/') + 1)),
    readFile: async (p) => {
      const value = files.get(p);
      if (value === undefined) throw new Error(`ENOENT: ${p}`);
      return value;
    },
    writeFile: async (p, data) => {
      files.set(p, data);
      writes.push(p);
    },
  };
  return { io, files, writes };
}

describe('#1862 regen refuses to write a silent Assignment History deletion', () => {
  it('reports the failure instead of regenerating an aggregate with the section gone', async () => {
    const { io } = makeShardIO();

    const result = await regenerate(SHARD_DIR, io);

    expect(result.ok).toBe(false);
    if (result.ok) {
      // Guard the exact regression: succeeding here means the caller is handed a
      // document whose history section has been dropped.
      expect(result.value).toContain('## Assignment History');
    }
  });

  it('leaves docs/roadmap.md untouched — the deletion is never written to disk', async () => {
    const { io, files, writes } = makeShardIO();
    files.set(ROADMAP_PATH, '# Roadmap\n\n## Assignment History\n\n(92 lines of history)\n');

    const result = await writeRegeneratedRoadmap(SHARD_DIR, ROADMAP_PATH, io);

    expect(result.ok).toBe(false);
    expect(writes).not.toContain(ROADMAP_PATH);
    expect(files.get(ROADMAP_PATH)).toContain('## Assignment History');
  });
});
