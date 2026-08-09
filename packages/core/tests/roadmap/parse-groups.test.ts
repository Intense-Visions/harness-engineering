import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import { GROUPED_ROADMAP_MD, GROUPED_ROADMAP, VALID_ROADMAP_MD, VALID_ROADMAP } from './fixtures';

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

describe('parseRoadmap() — the marker is explicit (no inference)', () => {
  const MD = (section: string) => `---
project: p
version: 1
last_synced: 2026-05-01T10:00:00Z
last_manual_edit: 2026-05-01T09:00:00Z
---

# Roadmap

## M1

${section}
`;

  it('still errors on a plain H3 with no status (crit. 6)', () => {
    const result = parseRoadmap(MD('### Mystery section\n\n- some prose, no status bullet\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(
      'Feature "Mystery section" has invalid status: "(missing)"'
    );
  });

  it('still errors on a feature H3 with an invalid status (crit. 3)', () => {
    const result = parseRoadmap(MD('### Bad Status\n\n- **Status:** cancelled\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Feature "Bad Status" has invalid status: "cancelled"');
  });

  it('does not feature-validate a group body that looks like a feature (D3)', () => {
    const result = parseRoadmap(MD('### Group: Looks like a feature\n\n- **Status:** cancelled\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones[0]?.features).toEqual([]);
    expect(result.value.milestones[0]?.groups?.[0]?.body).toBe('- **Status:** cancelled');
  });

  it('does not treat a lowercase or unspaced marker as a group', () => {
    expect(parseRoadmap(MD('### group: not the marker\n\n- prose\n')).ok).toBe(false);
    expect(parseRoadmap(MD('### Group:no-space\n\n- prose\n')).ok).toBe(false);
  });
});

describe('parseRoadmap() — strict roadmaps keep their exact object shape (D4)', () => {
  it('adds no `groups` key to milestones of a group-free roadmap', () => {
    const result = parseRoadmap(VALID_ROADMAP_MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const milestone of result.value.milestones) {
      expect(Object.keys(milestone)).toEqual(['name', 'isBacklog', 'features']);
      expect('groups' in milestone).toBe(false);
    }
    expect(result.value).toEqual(VALID_ROADMAP);
  });
});
