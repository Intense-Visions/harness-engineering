import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
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
