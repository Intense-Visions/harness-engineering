import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { VALID_ROADMAP } from './fixtures';

// Reproduces a parse <-> serialize round-trip corruption bug in the `Blocked by`
// (and equally `Plan`) list fields. `listOrDash` joins a feature's `blockedBy`
// array with ", " (src/roadmap/serialize.ts:89), and `parseListField` splits the
// re-read value back on "," with no escaping (src/roadmap/parse.ts:259). A
// single blockedBy entry that itself contains a comma — e.g. a feature name
// authored via the MCP `manage_roadmap` write path
// (packages/cli/src/mcp/tools/roadmap.ts / roadmap-file-less.ts, which assigns
// caller-supplied `blocked_by` array items with no comma sanitization) —
// therefore comes back as TWO separate list items after a round trip instead of
// the original one, silently fabricating a blocker that never existed.
// NOTE: marked `it.fails` — this is a REPRO-ONLY branch (no fix). The bug is
// live on `main`, so the round-trip assertion below currently throws;
// `it.fails` declares that expected failure, keeping the reproduction green in
// CI without silencing it. It flips to a hard failure the day the serialize
// grammar is fixed — at which point this test should be converted to a normal
// `it(...)` regression guard. See the tracking issue for the proposed fix.
describe('roadmap round-trip: list field (blockedBy) comma corruption', () => {
  it.fails('splits a single blockedBy item containing a comma into two items', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    // A real-world shape: a blocker entry that embeds a qualifier after a comma.
    roadmap.milestones[0]!.features[1]!.blockedBy = ['Notification System, phase 2'];

    const markdown = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(markdown);

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // Fails today: reparsed blockedBy is ['Notification System', 'phase 2'] —
    // one authored blocker becomes two, and the second ("phase 2") does not
    // even name a real feature.
    expect(reparsed.value).toEqual(roadmap);
  });
});
