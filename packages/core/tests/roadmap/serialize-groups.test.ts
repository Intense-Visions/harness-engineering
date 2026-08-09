import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { GROUPED_ROADMAP, GROUPED_ROADMAP_MD, VALID_ROADMAP, VALID_ROADMAP_MD } from './fixtures';

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
