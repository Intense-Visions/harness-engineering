import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import { serializeRoadmap } from '../../src/roadmap/serialize';

/**
 * bug-fleet A1 reproduction.
 *
 * `parseMilestones` classifies a milestone as the backlog lane by comparing the
 * RAW H2 heading text to `'Backlog'`, but derives `milestone.name` by stripping a
 * leading `Milestone: `. `serializeMilestoneHeading` then emits `## Backlog` for
 * `isBacklog`, else `## ${name}` — with the `Milestone: ` prefix dropped.
 *
 * So `## Milestone: Backlog` parses to `{ name: 'Backlog', isBacklog: false }`,
 * serializes to `## Backlog`, and re-parses as `{ name: 'Backlog', isBacklog: true }`.
 * A modeled boolean field flips across one write, which makes
 * `parse → serialize → parse` non-idempotent — the property the byte-stable
 * roadmap regen depends on. `preservation.ts` explicitly treats the `Milestone: `
 * prefix as a cosmetic normalization, so nothing reports this loss either.
 */
const MILESTONE_PREFIXED_BACKLOG = [
  '---',
  'project: demo',
  'version: 1',
  'last_synced: 2026-07-17T00:00:00.000Z',
  'last_manual_edit: 2026-07-17T00:00:00.000Z',
  '---',
  '',
  '# Roadmap',
  '',
  '## Milestone: Backlog',
  '',
  '### A',
  '',
  '- **Status:** planned',
  '- **Spec:** —',
  '- **Summary:** x',
  '- **Blockers:** —',
  '- **Plan:** —',
  '',
].join('\n');

describe('roadmap round trip — `## Milestone: Backlog`', () => {
  it('preserves isBacklog across parse → serialize → parse', () => {
    const first = parseRoadmap(MILESTONE_PREFIXED_BACKLOG);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = parseRoadmap(serializeRoadmap(first.value));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.milestones[0]!.isBacklog).toBe(first.value.milestones[0]!.isBacklog);
  });
});
