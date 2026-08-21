import { describe, it, expect } from 'vitest';
import {
  GROUP_PREFIX,
  FEATURE_PREFIX,
  parseFeatureHeading,
  matchFeatureHeadings,
  serializeFeatureHeading,
} from '../../src/roadmap/heading';
import { parseRoadmap } from '../../src/roadmap/parse';
import { serializeShard, parseShard } from '../../src/roadmap/store/shard';
import type { Shard } from '../../src/roadmap/store/roadmap-store';
import { MARKER_NAMES } from './fixtures';

describe('the shared H3 heading grammar (single source of truth, #1261)', () => {
  describe('serializeFeatureHeading emits exactly one space', () => {
    it('emits the bare form for a plain name', () => {
      expect(serializeFeatureHeading('Ship the parser')).toBe('### Ship the parser');
    });

    it('escapes a Feature:-prefixed name with exactly one space either side', () => {
      expect(serializeFeatureHeading('Feature: x')).toBe('### Feature: Feature: x');
    });

    it('escapes a Group:-prefixed name so it stays a feature', () => {
      expect(serializeFeatureHeading('Group: Auth hardening')).toBe(
        '### Feature: Group: Auth hardening'
      );
    });
  });

  describe('lenient read: `###  Feature:  x` is accepted with \\s+', () => {
    it('parseFeatureHeading (the shard path) reads the lenient form', () => {
      expect(parseFeatureHeading('###  Feature:  x')).toEqual({
        name: 'x',
        explicitFeature: true,
      });
    });

    it('matchFeatureHeadings (the monolith path) reads the lenient form', () => {
      const [match] = matchFeatureHeadings('###  Feature:  x\n');
      expect(match).toMatchObject({ name: 'x', explicitFeature: true, startIndex: 0 });
    });

    it('both readers agree on the lenient form — the divergence that motivated #1261', () => {
      const line = '###  Feature:  x';
      const shardSide = parseFeatureHeading(line);
      const monolithSide = matchFeatureHeadings(line)[0];
      expect(shardSide).toEqual({ name: 'x', explicitFeature: true });
      expect(monolithSide).toMatchObject({ name: 'x', explicitFeature: true });
    });

    it('reports explicitFeature=false for a bare heading', () => {
      expect(parseFeatureHeading('### x')).toEqual({ name: 'x', explicitFeature: false });
    });

    it('returns null for a non-heading line', () => {
      expect(parseFeatureHeading('- **Status:** planned')).toBeNull();
      expect(parseFeatureHeading('## Milestone')).toBeNull();
    });
  });

  describe('matchFeatureHeadings positions', () => {
    it('finds every heading in document order with slice offsets', () => {
      const body = '### One\n\n- **Status:** planned\n\n### Feature: Two\n';
      const matches = matchFeatureHeadings(body);
      expect(matches.map((m) => m.name)).toEqual(['One', 'Two']);
      expect(matches[0]!.startIndex).toBe(0);
      expect(matches[1]!.startIndex).toBe(body.indexOf('### Feature: Two'));
      expect(matches[1]!.explicitFeature).toBe(true);
    });
  });

  describe('serialize → parse identity for marker-colliding names', () => {
    for (const name of MARKER_NAMES) {
      it(`round-trips ${JSON.stringify(name)} through the emitter and reader`, () => {
        const line = serializeFeatureHeading(name);
        // The emitter never leaves a name readable as the wrong thing: a
        // marker-prefixed name is always escaped.
        if (name.startsWith(GROUP_PREFIX) || name.startsWith(FEATURE_PREFIX)) {
          expect(line.startsWith(`### ${FEATURE_PREFIX}`)).toBe(true);
        }
        // The reader's regex strips exactly the one escape prefix the emitter
        // added, so the recovered name equals the original with no further work.
        const parsed = parseFeatureHeading(line);
        expect(parsed).not.toBeNull();
        expect(parsed!.name).toBe(name);
      });
    }
  });
});

const LENIENT_MD = `---
project: p
version: 1
last_synced: 2026-05-01T10:00:00Z
last_manual_edit: 2026-05-01T09:00:00Z
---

# Roadmap

## M1

###  Feature:  Group: Auth hardening

- **Status:** planned
- **Summary:** hand-edited with extra whitespace
- **External-ID:** github:o/r#7
`;

describe('a hand-edited lenient heading round-trips through BOTH read paths (#1261)', () => {
  it('the monolith reader parses `###  Feature:  Group: x` as the tracked feature', () => {
    const result = parseRoadmap(LENIENT_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const features = result.value.milestones[0]?.features ?? [];
    // Before the lenient widening, the monolith reader required a single space and
    // would NOT have matched this heading — the row would have been swallowed into
    // the previous section rather than tracked. It is now read as the escaped
    // feature named `Group: Auth hardening`, not reclassified as a narrative group.
    expect(features.map((f) => f.name)).toEqual(['Group: Auth hardening']);
    expect(result.value.milestones[0]?.groups).toBeUndefined();
    expect(features[0]?.externalId).toBe('github:o/r#7');
  });

  it('the shard reader parses the same lenient heading to the same name', () => {
    const shardMd = `---
slug: row-1
milestone: "M1"
order: 0
---

###  Feature:  Group: Auth hardening

- **Status:** planned
- **Summary:** hand-edited with extra whitespace
- **External-ID:** github:o/r#7
`;
    const parsed = parseShard(shardMd);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.feature.name).toBe('Group: Auth hardening');
    expect(parsed.value.feature.externalId).toBe('github:o/r#7');
  });
});

describe('serialize → parse is an identity through the shard emitter', () => {
  for (const name of MARKER_NAMES) {
    it(`emits one-space bytes for ${JSON.stringify(name)} that re-read to the same name`, () => {
      const shard: Shard = {
        slug: 'row-1',
        milestone: 'M1',
        order: 0,
        feature: {
          name,
          status: 'planned',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 's',
          assignee: null,
          priority: null,
          externalId: 'github:o/r#1',
          updatedAt: null,
        },
      };
      const md = serializeShard(shard);
      // One-space emit: the heading line never carries a doubled space.
      const headingLine = md.split('\n').find((l) => l.startsWith('### '))!;
      expect(headingLine).not.toMatch(/^###\s{2,}/);
      expect(headingLine).not.toMatch(/Feature:\s{2,}/);
      const reparsed = parseShard(md);
      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) return;
      expect(reparsed.value.feature.name).toBe(name);
    });
  }
});
