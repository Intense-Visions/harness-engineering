import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import { GROUPED_ROADMAP_MD, GROUPED_ROADMAP } from './fixtures';

describe('parseRoadmap() — `### Group:` narrative sections', () => {
  it('parses a grouped roadmap to the expected object', () => {
    const result = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(GROUPED_ROADMAP);
  });

  it('captures the group name without the marker prefix', () => {
    const result = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones[0]?.groups?.map((g) => g.name)).toEqual(['Narrative arc']);
  });

  it('emits no feature for a group section', () => {
    const result = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones[0]?.features.map((f) => f.name)).toEqual(['Ship the parser']);
    expect(result.value.milestones[1]?.features).toEqual([]);
  });

  it('captures the group body verbatim, trimmed of surrounding blank lines', () => {
    const result = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.value.milestones[0]?.groups?.[0]?.body ?? '';
    expect(body.startsWith('- Status: shipped in spirit')).toBe(true);
    expect(body.endsWith('captured verbatim.')).toBe(true);
    expect(body).toContain('> A blockquote inside a group body is captured verbatim.');
  });

  it('supports an all-narrative milestone with no features', () => {
    const result = parseRoadmap(GROUPED_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const backlog = result.value.milestones[1];
    expect(backlog?.isBacklog).toBe(true);
    expect(backlog?.groups).toEqual([
      { name: 'Someday themes', body: '- Grouping is narrative; shards stay strict.' },
    ]);
  });
});
