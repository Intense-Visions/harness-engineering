import { describe, it, expect } from 'vitest';
import type { Roadmap } from '@harness-engineering/types';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import {
  GROUPED_ROADMAP,
  GROUPED_ROADMAP_MD,
  VALID_ROADMAP,
  VALID_ROADMAP_MD,
  MARKER_NAMES,
} from './fixtures';

describe('serializeRoadmap() — `### Group:` narrative sections', () => {
  it('emits a grouped roadmap byte-identically to its fixture', () => {
    expect(serializeRoadmap(GROUPED_ROADMAP)).toBe(GROUPED_ROADMAP_MD);
  });

  it('emits the marker heading and the verbatim body', () => {
    const out = serializeRoadmap(GROUPED_ROADMAP);
    expect(out).toContain('### Group: Narrative arc');
    expect(out).toContain('> A blockquote inside a group body is captured verbatim.');
  });

  it('emits groups after the milestone features', () => {
    const out = serializeRoadmap(GROUPED_ROADMAP);
    expect(out.indexOf('### Ship the parser')).toBeLessThan(
      out.indexOf('### Group: Narrative arc')
    );
  });

  it('leaves a group-free roadmap byte-identical', () => {
    expect(serializeRoadmap(VALID_ROADMAP)).toBe(VALID_ROADMAP_MD);
  });

  it('emits a heading-only group with no stray blank line for an empty body', () => {
    const out = serializeRoadmap({
      ...GROUPED_ROADMAP,
      milestones: [
        { name: 'M1', isBacklog: false, features: [], groups: [{ name: 'X', body: '' }] },
      ],
    });
    expect(out).toContain('## M1\n\n### Group: X\n');
    expect(out).not.toContain('### Group: X\n\n\n');
  });
});

describe('round-trip with narrative groups (crit. 4)', () => {
  it('parse → serialize reproduces the source bytes', () => {
    const parsed = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializeRoadmap(parsed.value)).toBe(GROUPED_ROADMAP_MD);
  });

  it('parse → serialize → parse yields an equal object (groups not dropped)', () => {
    const first = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseRoadmap(serializeRoadmap(first.value));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual(first.value);
    expect(second.value.milestones[0]?.groups).toEqual(first.value.milestones[0]?.groups);
  });

  it('survives a mutate-in-the-middle write cycle', () => {
    const parsed = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    parsed.value.milestones[0]!.features[0]!.status = 'done';
    const reparsed = parseRoadmap(serializeRoadmap(parsed.value));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.milestones[0]?.features[0]?.status).toBe('done');
    expect(reparsed.value.milestones[0]?.groups).toEqual(GROUPED_ROADMAP.milestones[0]?.groups);
  });
});

describe('a feature name that collides with an H3 marker survives the write path', () => {
  /**
   * Reachable with zero hand-authoring via `manage_roadmap add`, which takes a
   * free-form feature name. Before the `Feature: ` escape the serializer emitted bytes
   * its own parser re-read as a narrative group (`Group: x`, destroying the row and its
   * tracker mapping) or as a differently-named row (`Feature: x` -> `x`, silently
   * renaming it and changing its shard slug).
   *
   * Parameterized over the shared MARKER_NAMES so this seam and the shard seam in
   * `groups-write-paths.test.ts` are provably tested against the same names.
   */
  const withName = (name: string): Roadmap => ({
    frontmatter: {
      project: 'p',
      version: 1,
      lastSynced: '2026-05-01T10:00:00Z',
      lastManualEdit: '2026-05-01T09:00:00Z',
    },
    milestones: [
      {
        name: 'M1',
        isBacklog: false,
        features: [
          {
            name,
            status: 'in-progress',
            spec: null,
            plans: [],
            blockedBy: [],
            summary: 'A tracked row whose name collides with a marker',
            assignee: '@cwarner',
            priority: null,
            externalId: 'github:o/r#5',
            updatedAt: null,
          },
        ],
      },
    ],
    assignmentHistory: [],
  });

  it('emits the explicit `### Feature: ` prefix to disambiguate a marker-prefixed name', () => {
    expect(serializeRoadmap(withName('Group: Auth hardening'))).toContain(
      '### Feature: Group: Auth hardening'
    );
  });

  for (const name of MARKER_NAMES) {
    it(`keeps the name ${JSON.stringify(name)} across serialize → parse → serialize`, () => {
      const original = withName(name);
      const once = serializeRoadmap(original);
      const first = parseRoadmap(once);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.milestones[0]?.features[0]?.name).toBe(name);
      expect(first.value.milestones[0]?.groups).toBeUndefined();
      // Byte-stable, so the name cannot erode over repeated writes. Deep equality
      // also covers every other field, the External-ID tracker mapping included.
      expect(serializeRoadmap(first.value)).toBe(once);
      expect(first.value).toEqual(original);
    });
  }
});
