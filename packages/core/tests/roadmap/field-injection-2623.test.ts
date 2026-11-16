/**
 * Line-break injection through roadmap field values (#2623).
 *
 * The roadmap grammar is line-oriented: a `### <name>` heading, then one
 * `- **Field:** value` bullet per line, read back per line. A field value that
 * carries a line break therefore splits into a NEW line on write, and that line
 * can be a forged bullet (`- **Status:** done` flips the row) or heading (which
 * makes the whole roadmap unparseable). JS `^`/`$` under the `m` flag also break
 * on U+2028 / U+2029, so those are line breaks to the parser too.
 *
 * Two layers are pinned here:
 *  - `validateRoadmapFeatureFields` — the API-boundary check writers call so a
 *    bad value is refused with a clear error and nothing is written;
 *  - `serializeFeature` — refuses to EMIT a line-breaking value, so every writer
 *    (monolith, shard store, aggregate regen) is protected, not only the MCP tool.
 */
import { describe, it, expect } from 'vitest';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import { parseRoadmap } from '../../src/roadmap/parse';
import { serializeRoadmap, serializeFeature } from '../../src/roadmap/serialize';
import { serializeShard, parseShard } from '../../src/roadmap/store/shard';
import { validateRoadmapFeatureFields } from '../../src/roadmap/field-guard';

function feature(overrides: Partial<RoadmapFeature> = {}): RoadmapFeature {
  return {
    name: 'Alpha',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'A summary',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
    ...overrides,
  };
}

function roadmapWith(f: RoadmapFeature): Roadmap {
  return {
    frontmatter: {
      project: 'p',
      version: 1,
      lastSynced: '2026-01-01T00:00:00Z',
      lastManualEdit: '2026-01-01T00:00:00Z',
    },
    milestones: [{ name: 'M1', isBacklog: false, features: [f] }],
    assignmentHistory: [],
  };
}

const FORGED = '- **Status:** done';

/** Every field a writer can set, with an injection payload for each line break. */
const INJECTIONS: Array<[string, Partial<RoadmapFeature>]> = [];
for (const [label, br] of [
  ['LF', '\n'],
  ['CR', '\r'],
  ['U+2028', '\u2028'],
  ['U+2029', '\u2029'],
] as const) {
  INJECTIONS.push(
    [`name ${label}`, { name: `Alpha${br}${FORGED}` }],
    [`spec ${label}`, { spec: `docs/x.md${br}${FORGED}` }],
    [`plans item ${label}`, { plans: [`docs/plan.md${br}${FORGED}`] }],
    [`blockedBy item ${label}`, { blockedBy: [`Beta${br}${FORGED}`] }],
    [`assignee ${label}`, { assignee: `alice${br}${FORGED}` }],
    [`externalId ${label}`, { externalId: `github:o/r#1${br}${FORGED}` }],
    [`updatedAt ${label}`, { updatedAt: `2026-01-01${br}${FORGED}` }]
  );
}
// Summary is multi-line capable: LF / CR are escaped by the summary codec
// (#1756). The Unicode separators are NOT, and the parser breaks lines on them.
INJECTIONS.push(
  ['summary U+2028', { summary: `x\u2028${FORGED}` }],
  ['summary U+2029', { summary: `x\u2029${FORGED}` }]
);

describe('roadmap field line-break injection (#2623)', () => {
  describe('serializeFeature refuses to emit a line-breaking value', () => {
    it.each(INJECTIONS)('%s', (_label, overrides) => {
      const f = feature(overrides);
      expect(() => serializeFeature(f)).toThrow(/line break|control character/i);
      expect(() => serializeRoadmap(roadmapWith(f))).toThrow(/line break|control character/i);
      expect(() =>
        serializeShard({ slug: 'alpha', milestone: 'M1', order: 1, feature: f })
      ).toThrow(/line break|control character/i);
    });

    it('a heading-shaped name cannot forge a new row', () => {
      const f = feature({ name: 'Alpha\n### Evil' });
      expect(() => serializeRoadmap(roadmapWith(f))).toThrow(/line break/i);
    });

    it('refuses a line-breaking milestone name', () => {
      const rm = roadmapWith(feature());
      rm.milestones[0]!.name = `M1\n${FORGED}`;
      expect(() => serializeRoadmap(rm)).toThrow(/line break/i);
    });
  });

  describe('validateRoadmapFeatureFields (API boundary)', () => {
    it.each(INJECTIONS)('rejects %s, naming the field', (_label, overrides) => {
      const r = validateRoadmapFeatureFields(overrides);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/control character|line break/i);
    });

    it('rejects other control characters in single-line fields and in summary', () => {
      for (const ch of ['\u0000', '\u0007', '\u000b', '\u000c', '\u001b', '\u007f']) {
        expect(validateRoadmapFeatureFields({ name: `a${ch}b` }).ok).toBe(false);
        expect(validateRoadmapFeatureFields({ summary: `a${ch}b` }).ok).toBe(false);
      }
    });

    it('names the offending field and code point', () => {
      const r = validateRoadmapFeatureFields({ assignee: 'alice\nbob' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.message).toContain('assignee');
        expect(r.error.message).toContain('U+000A');
      }
      const m = validateRoadmapFeatureFields({ milestone: 'M\r1' });
      expect(m.ok).toBe(false);
      if (!m.ok) expect(m.error.message).toContain('milestone');
    });

    it('accepts ordinary values, tabs, non-ASCII text, and a multi-line summary', () => {
      const r = validateRoadmapFeatureFields({
        name: 'Notification System, phase 2 — “quoted” ✓',
        status: 'in-progress',
        spec: 'docs/changes/x/proposal.md',
        summary: 'line one\nline two\r\nline three\twith a tab, and a \\d regex',
        plans: ['docs/plans/a.md', 'b'],
        blockedBy: ['Beta, phase 1'],
        assignee: '@alice',
        priority: 'P1',
        externalId: 'github:o/r#42',
        updatedAt: '2026-01-01T00:00:00Z',
        milestone: 'Milestone: MVP',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('positive control: ordinary content still round-trips', () => {
    it('a multi-line summary and normal fields survive parse → serialize → parse', () => {
      const f = feature({
        name: 'Alpha, with comma',
        spec: 'docs/x.md',
        plans: ['docs/plan.md'],
        blockedBy: ['Beta'],
        summary: 'line one\nline two\twith tab',
        assignee: 'alice',
        priority: 'P2',
        externalId: 'github:o/r#1',
      });
      const md = serializeRoadmap(roadmapWith(f));
      const parsed = parseRoadmap(md);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.milestones[0]!.features).toEqual([f]);
      expect(serializeRoadmap(parsed.value)).toBe(md);

      const shard = serializeShard({ slug: 'alpha', milestone: 'M1', order: 1, feature: f });
      const back = parseShard(shard);
      expect(back.ok && back.value.feature).toEqual(f);
    });
  });
});
