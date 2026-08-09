import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import { GROUPED_ROADMAP_MD, GROUPED_ROADMAP, VALID_ROADMAP_MD, VALID_ROADMAP } from './fixtures';

/** Wrap a milestone-body `section` in a minimal valid roadmap document. */
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

  it('trims the group name so trailing whitespace is not a distinct group', () => {
    const result = parseRoadmap(MD('### Group: Foo   \n\n- a\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones[0]?.groups?.map((g) => g.name)).toEqual(['Foo']);
  });

  it('rejects a group heading with no name rather than emitting an unstable one', () => {
    // `### Group: ` would round-trip with a trailing space; a trim-on-save editor
    // turns it into `### Group:`, which is no longer the marker and would make the
    // whole roadmap fail to parse.
    const result = parseRoadmap(MD('### Group: \n\n- a\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('has a group heading with no name');
    // Must locate the problem the way every sibling parse error does.
    expect(result.error.message).toContain('Milestone "M1"');
    expect(result.error.message).toMatch(/line \d+ of that section/);
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

describe('parseRoadmap() — a real feature may be NAMED "Group: ..." (explicit Feature: wins)', () => {
  it('parses `### Feature: Group: X` as a FEATURE, keeping its fields', () => {
    const result = parseRoadmap(
      MD(
        '### Feature: Group: Chat rollout\n\n' +
          '- **Status:** in-progress\n' +
          '- **Summary:** A genuinely tracked row\n' +
          '- **Assignee:** @cwarner\n' +
          '- **External-ID:** github:o/r#5\n'
      )
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const milestone = result.value.milestones[0];
    expect(milestone?.features.map((f) => f.name)).toEqual(['Group: Chat rollout']);
    expect(milestone?.features[0]?.status).toBe('in-progress');
    expect(milestone?.features[0]?.assignee).toBe('@cwarner');
    // The tracker mapping must survive — losing it unlinks the row from its issue.
    expect(milestone?.features[0]?.externalId).toBe('github:o/r#5');
    expect(milestone?.groups).toBeUndefined();
  });

  it('still treats a BARE `### Group: X` as a narrative group (D1 unchanged)', () => {
    const result = parseRoadmap(MD('### Group: Narrative only\n\n- prose\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.milestones[0]?.features).toEqual([]);
    expect(result.value.milestones[0]?.groups?.map((g) => g.name)).toEqual(['Narrative only']);
  });

  it('still validates a `### Feature: Group: X` row like any other feature', () => {
    const result = parseRoadmap(MD('### Feature: Group: Bad\n\n- **Status:** cancelled\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Feature "Group: Bad" has invalid status: "cancelled"');
  });
});
