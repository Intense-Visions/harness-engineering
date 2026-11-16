import { describe, it, expect } from 'vitest';
import {
  parseAssignmentHistory,
  serializeAssignmentHistory,
  UnreadableAssignmentHistoryError,
} from '../../src/roadmap/assignment-history';
import { parseRoadmap } from '../../src/roadmap/parse';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { regenerate } from '../../src/roadmap/store/regenerator';
import type { ShardIO } from '../../src/roadmap/store/shard-store';

// Reproductions for #1961 — the edges #1862 / PR #1952 opened in the
// `## Assignment History` reader. Every case is DATA-LOSS territory: a wrong answer
// here is written back to disk by the next `serializeRoadmap`, at exit 0.

const ALICE = {
  feature: 'Core foundation',
  assignee: 'alice',
  action: 'assigned',
  date: '2026-01-02',
} as const;

// --- 1. A bullet block missing its Feature bullet --------------------------------

describe('#1961 (1) a bullet block missing its Feature bullet never merges into its neighbour', () => {
  // The second block lost its `- **Feature:**` bullet. The reader used to keep
  // filling the FIRST block's draft, so bob's three fields overwrote alice's and
  // one corrupted record (`Core foundation / bob / completed / 2026-02-01`) came
  // back as the whole history — every line "consumed", so the guard never fired.
  const MISSING_FEATURE = [
    '## Assignment History',
    '',
    '- **Feature:** Core foundation',
    '- **Assignee:** alice',
    '- **Action:** assigned',
    '- **Date:** 2026-01-02',
    '',
    '- **Assignee:** bob',
    '- **Action:** completed',
    '- **Date:** 2026-02-01',
  ].join('\n');

  it('refuses the section instead of returning a corrupted survivor', () => {
    const result = parseAssignmentHistory(MISSING_FEATURE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(UnreadableAssignmentHistoryError);
      expect((result.error as UnreadableAssignmentHistoryError).unreadableLines).toEqual([
        '- **Assignee:** bob',
        '- **Action:** completed',
        '- **Date:** 2026-02-01',
      ]);
    }
  });

  it('refuses a block that repeats a label rather than letting the later value win', () => {
    const result = parseAssignmentHistory(
      [
        '## Assignment History',
        '',
        '- **Feature:** Core foundation',
        '- **Assignee:** alice',
        '- **Assignee:** bob',
        '- **Action:** assigned',
        '- **Date:** 2026-01-02',
      ].join('\n')
    );

    expect(result.ok).toBe(false);
  });

  it('still round-trips well-formed multi-record histories (property over shapes)', () => {
    const names = ['Auth | Login', 'API Gateway', '', 'multi\nline', 'trailing \\'];
    const actions = ['assigned', 'completed', 'unassigned'] as const;
    for (let n = 1; n <= names.length; n++) {
      const records = names.slice(0, n).map((feature, i) => ({
        feature,
        assignee: i % 2 === 0 ? 'alice' : '',
        action: actions[i % actions.length]!,
        date: `2026-0${(i % 9) + 1}-01`,
      }));
      const parsed = parseAssignmentHistory(serializeAssignmentHistory(records).join('\n'));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value).toEqual(records);
    }
  });
});

// --- 3. A legacy data row above the separator -----------------------------------

describe('#1961 (3) a legacy table row above the separator is reported, not dropped', () => {
  it('refuses a table carrying a data row between its header and separator', () => {
    const result = parseAssignmentHistory(
      [
        '## Assignment History',
        '| Feature | Assignee | Action | Date |',
        '| Core foundation | alice | assigned | 2026-01-02 |',
        '|---|---|---|---|',
        '| Core foundation | bob | unassigned | 2026-01-03 |',
      ].join('\n')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as UnreadableAssignmentHistoryError).unreadableLines).toEqual([
        '| Feature | Assignee | Action | Date |',
      ]);
    }
  });

  it('still treats exactly one row above the separator as the header', () => {
    const result = parseAssignmentHistory(
      [
        '## Assignment History',
        '| Feature | Assignee | Action | Date |',
        '|---|---|---|---|',
        '| Core foundation | alice | assigned | 2026-01-02 |',
      ].join('\n')
    );

    expect(result).toEqual({ ok: true, value: [ALICE] });
  });
});

// --- 4. GFM alignment separators ------------------------------------------------

describe('#1961 (4) a GFM alignment separator opens the legacy data rows', () => {
  for (const separator of [
    '| :--- | :--- | :---: | ---: |',
    '|:--|:--|:-:|--:|',
    '| --- | :-- | --- | --- |',
  ]) {
    it(`reads the rows under ${separator}`, () => {
      const result = parseAssignmentHistory(
        [
          '## Assignment History',
          '',
          '| Feature | Assignee | Action | Date |',
          separator,
          '| Core foundation | alice | assigned | 2026-01-02 |',
        ].join('\n')
      );

      expect(result).toEqual({ ok: true, value: [ALICE] });
    });
  }

  it('does not mistake a colon-only row for a separator', () => {
    const result = parseAssignmentHistory(
      ['## Assignment History', '| Feature | Assignee | Action | Date |', '| : | : |'].join('\n')
    );

    expect(result.ok).toBe(false);
  });
});

// --- 5. Headings that merely mention the section name ---------------------------

const ROADMAP_HEAD = [
  '---',
  'project: test',
  'version: 1',
  'last_synced: 2026-01-01T00:00:00Z',
  'last_manual_edit: 2026-01-01T00:00:00Z',
  '---',
  '',
  '# Roadmap',
  '',
];

const MILESTONE = [
  '## MVP',
  '',
  '### Core foundation',
  '',
  '- **Status:** done',
  '- **Spec:** —',
  '- **Summary:** The foundation.',
  '- **Blockers:** —',
  '- **Plan:** —',
  '',
];

describe('#1961 (5) a heading that only mentions "Assignment History" does not hard-fail', () => {
  it('parses a roadmap whose preamble carries an `### Assignment History` heading', () => {
    const md = [
      ...ROADMAP_HEAD,
      '### Assignment History',
      '',
      'Assignment history is kept at the bottom of this file.',
      '',
      ...MILESTONE,
    ].join('\n');

    const result = parseRoadmap(md);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assignmentHistory).toEqual([]);
  });

  it('parses a document whose near-miss H2 heading holds no records (nothing to lose)', () => {
    const result = parseAssignmentHistory(
      ['## Assignment History (moved to the wiki)', '', 'See the wiki.', ''].join('\n')
    );

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('parses an `#### Assignment History` sub-heading inside a feature description', () => {
    const result = parseAssignmentHistory(
      ['### Core foundation', '', '#### Assignment History', '', 'Owned by platform.'].join('\n')
    );

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('still refuses a near-miss H2 heading that carries records (the #1862 case)', () => {
    for (const body of [
      ['- **Feature:** Core foundation', '- **Assignee:** alice'],
      ['| Feature | Assignee | Action | Date |', '|--|--|--|--|'],
    ]) {
      const result = parseAssignmentHistory(
        ['## Assignment History (legacy)', '', ...body].join('\n')
      );
      expect(result.ok).toBe(false);
    }
  });
});

// --- 2. The near-miss heading on the shard path ---------------------------------

const SHARD_DIR = '/repo/docs/roadmap.d';

const META_FRONTMATTER = `---
project: "harness-engineering"
version: 1
last_synced: "2026-06-27T12:00:00.000Z"
last_manual_edit: "2026-06-27T11:00:00.000Z"
milestones:
  - "MVP Release"
---
`;

const SHARD_MD = `---
slug: core-foundation
milestone: MVP Release
order: 1
---

### Core foundation

- **Status:** done
- **Summary:** The foundation.
- **Blockers:** —
- **Plan:** —
`;

function shardIO(meta: string): ShardIO {
  const files = new Map<string, string>([
    [`${SHARD_DIR}/_meta.md`, meta],
    [`${SHARD_DIR}/core-foundation.md`, SHARD_MD],
  ]);
  return {
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
    },
    deleteFile: async (p) => {
      files.delete(p);
    },
  };
}

describe('#1961 (2) regen never writes an aggregate that parseRoadmap rejects', () => {
  const NEAR_MISS_META = [
    META_FRONTMATTER,
    '## Assignment History (legacy)',
    '',
    '- **Feature:** Core foundation',
    '- **Assignee:** alice',
    '- **Action:** assigned',
    '- **Date:** 2026-01-02',
    '',
  ].join('\n');

  it('refuses a `_meta.md` whose history heading is a near miss', async () => {
    const result = await regenerate(SHARD_DIR, shardIO(NEAR_MISS_META));

    // Before the fix: Ok, and the aggregate it handed back failed parseRoadmap —
    // the wedge, produced by a tool that reported success.
    if (result.ok) expect(parseRoadmap(result.value).ok).toBe(true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Assignment History (legacy)');
  });

  it('does not dress the near-miss refusal up as the escapable unreadable-section error', async () => {
    // `allowUnreadableHistory` cannot carry a section it cannot locate, so the
    // error must not be one the hatch (and the CLI's hatch advice) claims to handle.
    const result = await regenerate(SHARD_DIR, shardIO(NEAR_MISS_META), {
      allowUnreadableHistory: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toBeInstanceOf(UnreadableAssignmentHistoryError);
  });

  it('still regenerates a `_meta.md` whose preamble mentions the section in prose only', async () => {
    const meta = [
      META_FRONTMATTER,
      '## Assignment History (archived)',
      '',
      'Older entries live in the wiki.',
      '',
    ].join('\n');

    const result = await regenerate(SHARD_DIR, shardIO(meta));

    expect(result.ok).toBe(true);
  });
});

// --- Idempotence over a document carrying every repaired shape ------------------

describe('#1961 parse -> serialize -> parse is a fixed point for readable histories', () => {
  it('holds for a GFM-aligned legacy table migrated to bullets', () => {
    const md = [
      ...ROADMAP_HEAD,
      ...MILESTONE,
      '## Assignment History',
      '',
      '| Feature | Assignee | Action | Date |',
      '| :--- | :--- | :---: | ---: |',
      '| Core foundation | alice | assigned | 2026-01-02 |',
      '',
    ].join('\n');

    const first = parseRoadmap(md);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.assignmentHistory).toEqual([ALICE]);
    const once = serializeRoadmap(first.value);
    const second = parseRoadmap(once);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual(first.value);
    expect(serializeRoadmap(second.value)).toBe(once);
  });
});
