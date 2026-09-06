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
// `Ok([])`, but a heading carrying RECORD-SHAPED lines that yielded no record is an
// `Err`, and the regen path — which already returns before writing on a failed
// parse — refuses to write the truncated document instead of reporting success.
//
// "Record-shaped" is deliberately narrow: `- **` (the current bullet grammar) or
// `|` (a legacy table row) are the only two shapes this section has ever been
// WRITTEN in, so they are the only two that can carry data at risk. Prose
// placeholders, HTML comments and thematic breaks hold nothing to lose and must
// keep parsing as an empty history — the `no false alarm` block below is the
// regression guard for that, and it fails if the trigger is widened back to "any
// non-blank line".
//
// At the pinned base SHA every test in the two `#1862 ...` blocks FAILS by
// ASSERTION (the parse reports a successful empty history, and regen happily
// writes the deletion), not by a compile or resolution error.

/**
 * A history section in a grammar this parser cannot read — the migration case.
 *
 * The lines are record-SHAPED (`- **` bullets, the grammar history is written in
 * today) but carry labels a future format renamed, so not one record survives.
 * That is exactly what a parser built before a migration sees, and exactly the
 * state where 92 lines of real data are at stake.
 */
const UNREADABLE_HISTORY = [
  '## Assignment History',
  '',
  '- **Item:** Core foundation',
  '- **Owner:** alice',
  '- **Event:** assigned',
  '- **On:** 2026-01-02',
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

  it('names a remedy that can actually repair a separator-less legacy table', () => {
    // "upgrade the harness CLI" cannot restore a separator row that was never
    // written, and that is the very case this arm routes here. The message must
    // name the repair AND the recovery hatch, or the two documented remediation
    // paths just point at each other.
    const result = parseAssignmentHistory(SEPARATORLESS_LEGACY_HISTORY);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('separator row');
    expect(result.error.message).toContain('--allow-unreadable-history');
  });
});

// --- The trigger must not fire on lines that hold no record ---------------------
//
// Erroring on "any non-blank line under the heading" wedges every reader of the
// document over content that has nothing to lose. Each case below is a real
// document shape that a broad trigger turns into a hard parse failure.

describe('#1862 the unreadable-history guard raises no false alarm', () => {
  const stillEmpty = (body: string) => {
    const result = parseAssignmentHistory(body);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  };

  it('reads a prose placeholder as an empty history', () => {
    stillEmpty('## Assignment History\n\n_No assignments recorded yet._\n');
  });

  it('reads an HTML marker comment as an empty history', () => {
    stillEmpty('## Assignment History\n\n<!-- populated by sync -->\n');
  });

  it('reads a thematic break as an empty history', () => {
    stillEmpty('## Assignment History\n\n---\n');
  });

  it('reads a heading whose body is entirely blank as an empty history', () => {
    // The `> 0` carve-out in the guard. Delete it and this heading — which holds
    // no record to lose — starts failing the whole document.
    stillEmpty('## Assignment History\n\n \n\t\n\n');
  });

  it('ignores a fenced example that DEMONSTRATES the bullet grammar', () => {
    // A roadmap preamble carries instructions to humans and may show the format.
    // Without fence masking these bullets parse as PHANTOM history — records that
    // exist nowhere in the document get written into the aggregate.
    stillEmpty(
      [
        '# Roadmap',
        '',
        'History records look like this:',
        '',
        '```markdown',
        '## Assignment History',
        '',
        '- **Feature:** Auth',
        '- **Assignee:** alice',
        '- **Action:** assigned',
        '- **Date:** 2026-03-21',
        '```',
        '',
        '## MVP Release',
        '',
      ].join('\n')
    );
  });

  it('ignores a fenced example that DEMONSTRATES the legacy table', () => {
    // Without fence masking these `|` lines are record-shaped, read as zero
    // records, and hard-fail a document that has no history section at all.
    stillEmpty(
      [
        '# Roadmap',
        '',
        'Before v5 the section was a pipe table:',
        '',
        '```markdown',
        '## Assignment History',
        '',
        '| Feature | Assignee | Action | Date |',
        '|---------|----------|--------|------|',
        '```',
        '',
        '## MVP Release',
        '',
      ].join('\n')
    );
  });
});

// --- The section is bounded by the next heading of ANY level --------------------

describe('#1862 the history section does not swallow the section that follows it', () => {
  it('does not read records out of a following H3 section', () => {
    const body = [
      '## Assignment History',
      '',
      '- **Feature:** Core foundation',
      '- **Assignee:** alice',
      '- **Action:** assigned',
      '- **Date:** 2026-01-02',
      '',
      '### Migration notes',
      '',
      'An example of a record we no longer keep:',
      '',
      '- **Feature:** Example',
      '- **Assignee:** bob',
      '- **Action:** assigned',
      '- **Date:** 2026-01-03',
      '',
    ].join('\n');

    const result = parseAssignmentHistory(body);

    expect(result.ok).toBe(true);
    // Bounding only on the next `## ` swallows the H3 section and invents a
    // SECOND record out of prose that belongs to a different section.
    if (result.ok)
      expect(result.value).toEqual([
        { feature: 'Core foundation', assignee: 'alice', action: 'assigned', date: '2026-01-02' },
      ]);
  });

  it('does not hard-fail a blank history over content in a following H3 section', () => {
    const body = [
      '## Assignment History',
      '',
      '_No assignments recorded yet._',
      '',
      '### Legacy import log',
      '',
      '| when | note |',
      '| 2026-01-01 | migrated from the old tracker |',
      '',
    ].join('\n');

    const result = parseAssignmentHistory(body);

    // Bounding only on the next `## ` captures the import log's `|` rows, finds
    // them record-shaped and unreadable, and fails the WHOLE document while
    // naming a line that is not in the history section at all.
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
    deleteFile: async (p) => {
      if (!files.delete(p)) throw new Error(`ENOENT: ${p}`);
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

// --- The escape hatch out of a wedged repo --------------------------------------
//
// The refusal above fails READS, not just writes, so a `_meta.md` in this state
// wedges every consumer — including the pre-commit regen that the repair commit
// itself has to pass, leaving a pre-commit gate bypass as the only way out.
// `allowUnreadableHistory` is the way out, and it is LOSSLESS: the section is
// carried through verbatim rather than dropped, so the hatch cannot reintroduce
// the deletion the guard exists to stop.

describe('#1862 allowUnreadableHistory recovers a wedged repo without losing the section', () => {
  it('regenerates and carries the unreadable section through verbatim', async () => {
    const { io } = makeShardIO();

    const result = await regenerate(SHARD_DIR, io, { allowUnreadableHistory: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Every line of the unreadable section survives, byte for byte.
    for (const line of UNREADABLE_HISTORY.split('\n')) {
      if (line !== '') expect(result.value).toContain(line);
    }
    // And the rest of the aggregate is still regenerated normally.
    expect(result.value).toContain('### Core foundation');
  });

  it('writes that aggregate to disk so a shard-touching commit can proceed', async () => {
    const { io, files, writes } = makeShardIO();

    const result = await writeRegeneratedRoadmap(SHARD_DIR, ROADMAP_PATH, io, {
      allowUnreadableHistory: true,
    });

    expect(result.ok).toBe(true);
    expect(writes).toContain(ROADMAP_PATH);
    expect(files.get(ROADMAP_PATH)).toContain('- **Item:** Core foundation');
  });

  it('still fails on a read error the hatch does not forgive', async () => {
    // The hatch forgives the history parse and NOTHING else — a structurally
    // broken shard dir must keep failing even with it set.
    const { io } = makeShardIO();
    const broken: ShardIO = {
      ...io,
      listDir: async () => {
        throw new Error('EACCES');
      },
    };

    const result = await regenerate(SHARD_DIR, broken, { allowUnreadableHistory: true });

    expect(result.ok).toBe(false);
  });
});
