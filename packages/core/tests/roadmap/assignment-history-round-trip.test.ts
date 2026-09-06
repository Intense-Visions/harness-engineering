import { describe, it, expect } from 'vitest';
import type { AssignmentRecord, Roadmap } from '@harness-engineering/types';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import {
  serializeAssignmentHistory,
  parseAssignmentHistory,
} from '../../src/roadmap/assignment-history';
import { findUnpreservedLines } from '../../src/roadmap/preservation';
import { parseMeta, serializeMeta } from '../../src/roadmap/store/meta';
import { VALID_ROADMAP } from './fixtures';
import { META_WITH_HISTORY } from './store/fixtures';

// Round-trip fidelity of the `## Assignment History` section (#1811).
//
// The section used to be a markdown pipe table whose four values were recovered
// POSITIONALLY from an unescaped `split('|')`. A feature name is free text, so a
// name containing `|` produced a row with extra cells; `action` landed on the
// wrong cell, failed its membership check, and the whole record was dropped —
// silently. The fix moved the section off the table onto four `- **Key:** value`
// bullets per record, so there is no column separator to collide with.
//
// These tests are deliberately format-AGNOSTIC: every assertion is about what
// survives `serialize → parse`, never about which bytes are emitted. That is what
// makes them a regression guard rather than a snapshot of today's grammar.

/** Values that a pipe-table cell could not carry. `|` is the #1811 reproducer. */
const ADVERSARIAL: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'an embedded pipe (the #1811 reproducer)', value: 'Auth | Login flow' },
  { name: 'a leading and trailing pipe', value: '|Auth|' },
  { name: 'consecutive pipes', value: 'Auth || Login' },
  { name: 'a table-separator lookalike', value: '---|---|---' },
  { name: 'an embedded newline', value: 'Auth\nLogin flow' },
  { name: 'a carriage return', value: 'Auth\r\nLogin flow' },
  { name: 'backticks', value: 'Fix `parseAssignmentHistory()` crash' },
  { name: 'a backslash', value: 'C:\\path\\to\\thing' },
  { name: 'an escape sequence that must not be decoded twice', value: 'literal \\n and \\| here' },
  { name: 'a comma (the #1757 separator)', value: 'Notification System, phase 2' },
  { name: 'an em dash', value: 'Auth \u2014 Login flow' },
  { name: 'a markdown bullet lookalike', value: '- **Action:** completed' },
  { name: 'an H2 lookalike', value: '## Assignment History' },
  { name: 'leading and trailing spaces', value: '  padded  ' },
  { name: 'an empty string', value: '' },
];

function roadmapWithHistory(history: AssignmentRecord[]): Roadmap {
  const roadmap = structuredClone(VALID_ROADMAP);
  roadmap.assignmentHistory = history;
  return roadmap;
}

/** `serialize → parse` through the full monolith document. */
function roundTrip(history: AssignmentRecord[]): AssignmentRecord[] {
  const result = parseRoadmap(serializeRoadmap(roadmapWithHistory(history)));
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return result.value.assignmentHistory;
}

describe('assignment history round-trips adversarial field values (#1811)', () => {
  for (const { name, value } of ADVERSARIAL) {
    it(`preserves a record whose feature name contains ${name}`, () => {
      const history: AssignmentRecord[] = [
        { feature: value, assignee: 'alice', action: 'assigned', date: '2026-03-21' },
      ];
      expect(roundTrip(history)).toEqual(history);
    });

    it(`preserves a record whose assignee contains ${name}`, () => {
      const history: AssignmentRecord[] = [
        { feature: 'Auth', assignee: value, action: 'completed', date: '2026-03-21' },
      ];
      expect(roundTrip(history)).toEqual(history);
    });

    it(`preserves a record whose date contains ${name}`, () => {
      const history: AssignmentRecord[] = [
        { feature: 'Auth', assignee: 'alice', action: 'unassigned', date: value },
      ];
      expect(roundTrip(history)).toEqual(history);
    });
  }

  it('preserves order and count across a multi-record history with hostile values', () => {
    const history: AssignmentRecord[] = [
      { feature: 'Auth | Login', assignee: 'alice', action: 'assigned', date: '2026-03-21' },
      { feature: 'Auth | Login', assignee: 'alice', action: 'completed', date: '2026-03-22' },
      { feature: 'API\nGateway', assignee: 'b|b', action: 'assigned', date: '2026-03-23' },
      { feature: 'Plain feature', assignee: 'carol', action: 'unassigned', date: '2026-03-24' },
    ];
    expect(roundTrip(history)).toEqual(history);
  });

  it('survives TWO round-trips (the emitted form re-parses to itself)', () => {
    const history: AssignmentRecord[] = [
      {
        feature: 'Auth | Login \\ flow',
        assignee: 'a|ice',
        action: 'assigned',
        date: '2026-03-21',
      },
    ];
    expect(roundTrip(roundTrip(history))).toEqual(history);
  });

  it('emits no pipe-table row for a pipe-free history (the format really moved)', () => {
    const md = serializeAssignmentHistory([
      { feature: 'Auth', assignee: 'alice', action: 'assigned', date: '2026-03-21' },
    ]).join('\n');
    expect(md).not.toMatch(/^\|/m);
    expect(md).toContain('- **Feature:** Auth');
  });

  it('a rewrite of the emitted section loses no lines (preservation guard, #839)', () => {
    const md = serializeRoadmap(
      roadmapWithHistory([
        { feature: 'Auth | Login', assignee: 'alice', action: 'assigned', date: '2026-03-21' },
      ])
    );
    expect(findUnpreservedLines(md)).toEqual([]);
  });
});

describe('assignment history still READS the legacy pipe table (#1811)', () => {
  const LEGACY = [
    '## Assignment History',
    '| Feature | Assignee | Action | Date |',
    '|---------|----------|--------|------|',
    '| Core foundation | alice | assigned | 2026-01-02 |',
    '| Core foundation | bob | unassigned | 2026-01-03 |',
  ].join('\n');

  it('recovers every legacy row, so an un-migrated document keeps its history', () => {
    const result = parseAssignmentHistory(LEGACY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { feature: 'Core foundation', assignee: 'alice', action: 'assigned', date: '2026-01-02' },
      { feature: 'Core foundation', assignee: 'bob', action: 'unassigned', date: '2026-01-03' },
    ]);
  });

  it('keeps the legacy tolerance: a table with no separator row reads as empty', () => {
    const noSeparator = [
      '## Assignment History',
      '| Feature | Assignee | Action | Date |',
      '| Core foundation | alice | assigned | 2026-01-02 |',
    ].join('\n');
    const result = parseAssignmentHistory(noSeparator);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('migrates a legacy document to the new format without losing a record', () => {
    const parsed = parseAssignmentHistory(LEGACY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const migrated = serializeAssignmentHistory(parsed.value).join('\n');
    expect(migrated).not.toMatch(/^\|/m);
    const reparsed = parseAssignmentHistory(migrated);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.value).toEqual(parsed.value);
  });
});

describe('assignment history in the shard `_meta.md` (#1811)', () => {
  it('round-trips hostile values through serializeMeta -> parseMeta', () => {
    const meta = {
      ...META_WITH_HISTORY,
      assignmentHistory: [
        { feature: 'Auth | Login', assignee: 'a|ice', action: 'assigned', date: '2026-01-02' },
        { feature: 'Auth | Login', assignee: 'a|ice', action: 'completed', date: '2026-01-03' },
      ] as AssignmentRecord[],
    };
    const result = parseMeta(serializeMeta(meta));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assignmentHistory).toEqual(meta.assignmentHistory);
  });

  it('keeps the byte-stability contract: a history-free `_meta.md` is unchanged', () => {
    const { assignmentHistory: _dropped, ...historyFree } = META_WITH_HISTORY;
    const md = serializeMeta(historyFree);
    expect(md).not.toContain('## Assignment History');
    expect(md.endsWith('---\n')).toBe(true);
  });
});
