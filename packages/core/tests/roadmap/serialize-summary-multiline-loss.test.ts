import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { VALID_ROADMAP } from './fixtures';

// Reproduces a parse <-> serialize round-trip data-loss bug: `RoadmapFeature.summary`
// is typed `string` with no runtime guard against embedded newlines, and both the
// MCP `manage_roadmap` write path (packages/cli/src/mcp/tools/roadmap.ts /
// roadmap-file-less.ts) and `promoteFeature` (src/roadmap/promote.ts) assign
// caller-supplied text straight onto `feature.summary` with no sanitization.
//
// `serializeFeature` interpolates the summary verbatim onto a single
// `- **Summary:** <value>` bullet line (src/roadmap/serialize.ts:122), so an
// embedded newline splits it across two lines of markdown. `extractFieldMap`'s
// field regex is anchored per-line with no `s` flag
// (src/roadmap/parse.ts:240 `/^- \*\*(.+?):\*\* (.+)$/gm`), so only the first
// line is captured back into `summary` on the next parse — the continuation
// silently vanishes. A committed roadmap.md (or shard, which reuses this same
// `serializeFeature`/`extractFieldMap` grammar per store/shard.ts) round-tripped
// through any tool that re-serializes the roadmap therefore truncates any
// feature summary that happens to contain a newline.
// NOTE: marked `it.fails` — this is a REPRO-ONLY branch (no fix). The bug is
// live on `main`, so the round-trip assertion below currently throws;
// `it.fails` declares that expected failure, keeping the reproduction green in
// CI without silencing it. It flips to a hard failure the day the serialize
// grammar is fixed — at which point this test should be converted to a normal
// `it(...)` regression guard. See the tracking issue for the proposed fix.
describe('roadmap round-trip: summary embedded newline', () => {
  it.fails('does not survive parse(serialize(roadmap)) when summary contains a newline', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[0]!.summary =
      'Email and in-app notifications with polling\nfollow-up: add push channel';

    const markdown = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(markdown);

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // Fails today: the reparsed summary is truncated to the first line only,
    // silently dropping "follow-up: add push channel".
    expect(reparsed.value).toEqual(roadmap);
  });
});
