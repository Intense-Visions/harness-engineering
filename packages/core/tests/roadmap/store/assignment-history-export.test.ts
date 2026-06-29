import { describe, it, expect } from 'vitest';
import type { AssignmentRecord } from '@harness-engineering/types';
import { parseAssignmentHistory } from '../../../src/roadmap/parse';
import { serializeAssignmentHistory } from '../../../src/roadmap/serialize';

// A minimal `## Assignment History` body: one `assigned` + one `unassigned`
// record with ASCII (YYYY-MM-DD) dates. No issue refs needed here.
const HISTORY_MD = [
  '## Assignment History',
  '| Feature | Assignee | Action | Date |',
  '|---------|----------|--------|------|',
  '| Fix login | alice | assigned | 2026-01-02 |',
  '| Fix login | bob | unassigned | 2026-01-03 |',
].join('\n');

const EXPECTED: AssignmentRecord[] = [
  { feature: 'Fix login', assignee: 'alice', action: 'assigned', date: '2026-01-02' },
  { feature: 'Fix login', assignee: 'bob', action: 'unassigned', date: '2026-01-03' },
];

describe('parseAssignmentHistory() (exported for shard _meta reuse)', () => {
  it('parses an assigned + unassigned record from a markdown table body', () => {
    const r = parseAssignmentHistory(HISTORY_MD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(EXPECTED);
  });
});

describe('serializeAssignmentHistory() (exported for shard _meta reuse)', () => {
  it('round-trips: serialize -> parse yields the same records', () => {
    const md = serializeAssignmentHistory(EXPECTED).join('\n');
    const r = parseAssignmentHistory(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(EXPECTED);
  });
});
