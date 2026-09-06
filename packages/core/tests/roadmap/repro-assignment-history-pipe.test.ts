import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { VALID_ROADMAP } from './fixtures';

// Reproduction for the assignment-history table pipe round-trip data loss.
//
// The roadmap Assignment History section is emitted as a markdown pipe table
// (`serializeAssignmentHistory`): `| ${feature} | ${assignee} | ${action} | ${date} |`.
// `parseAssignmentHistory` reads it back by splitting each row on `|` and
// `.filter(c => c.length > 0)`. There is NO escaping of `|` in any cell, so a
// feature name (or assignee) that contains a pipe — free-text authored via the
// H3 heading / the MCP `manage_roadmap` write path — splits into extra cells on
// the next parse. The `action` column then lands on a non-action cell, the
// row's `cells[2]` fails the `['assigned','completed','unassigned']` membership
// check, and the WHOLE record is silently dropped.
//
// This is the same class of line-oriented round-trip data loss already fixed for
// the comma-in-list field (#1757) and the newline-in-summary field (#1756), but
// the pipe-in-table-cell case for Assignment History was never covered — those
// fixes explicitly scoped themselves to the single-line `- **Field:**` bullets.
//
// At the pinned base SHA this test FAILS by ASSERTION (reparsed history is `[]`,
// the record is gone), not by a compile/resolution error.
describe('roadmap round-trip: pipe in assignment-history feature name', () => {
  it('preserves an assignment record whose feature name contains a pipe', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.assignmentHistory = [
      { feature: 'Auth | Login flow', assignee: 'alice', action: 'assigned', date: '2026-03-21' },
    ];

    const markdown = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(markdown);

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // The record survives the parse → serialize → parse cycle intact.
    expect(reparsed.value.assignmentHistory).toEqual(roadmap.assignmentHistory);
  });
});
