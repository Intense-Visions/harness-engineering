import { describe, it, expect } from 'vitest';
import { findUnpreservedLines } from '../../src/roadmap/preservation';
import { parseRoadmap } from '../../src/roadmap/parse';
import { serializeRoadmap } from '../../src/roadmap/serialize';

/**
 * bug-fleet A1 reproduction.
 *
 * `findUnpreservedLines` is the #839 monolith write-preservation guard: it exists
 * to refuse a whole-file rewrite that would silently discard hand-authored content
 * `serializeRoadmap` does not model.
 *
 * #1811 moved the `## Assignment History` section from a pipe table to four
 * `- **Key:** value` bullets and added `Feature`, `Action` and `Date` to
 * `MODELED_FIELD_KEYS` so those bullets stay preservable. The key set is GLOBAL,
 * but those three keys are only modeled inside the history section — a feature
 * block that carries a `- **Date:** …` (or `- **Feature:** …` / `- **Action:** …`)
 * bullet is now declared preservable while `parseFeatureBlock` still ignores it,
 * so the rewrite drops it with the guard reporting nothing.
 *
 * Before #1811 that same line WAS reported, exactly like the `- **Issue:**` bullet
 * the guard's own test pins. This is the guard's core failure mode: silent loss it
 * promised to catch.
 */
const ROADMAP_WITH_UNMODELED_DATE_BULLET = [
  '---',
  'project: demo',
  'version: 1',
  'last_synced: 2026-07-17T00:00:00.000Z',
  'last_manual_edit: 2026-07-17T00:00:00.000Z',
  '---',
  '',
  '# Roadmap',
  '',
  '## Current Work',
  '',
  '### A feature',
  '',
  '- **Status:** planned',
  '- **Spec:** —',
  '- **Summary:** x',
  '- **Date:** 2026-03-01',
  '- **Blockers:** —',
  '- **Plan:** —',
  '',
].join('\n');

describe('findUnpreservedLines — #1811 history keys leak into feature blocks', () => {
  it('reports the unmodeled `- **Date:**` bullet a monolith rewrite would drop', () => {
    // The rewrite really does lose the line — that is the loss the guard must catch.
    const parsed = parseRoadmap(ROADMAP_WITH_UNMODELED_DATE_BULLET);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializeRoadmap(parsed.value)).not.toContain('- **Date:** 2026-03-01');

    // …so the guard must report it, exactly as it reports `- **Issue:** …`.
    expect(findUnpreservedLines(ROADMAP_WITH_UNMODELED_DATE_BULLET).map((l) => l.text)).toContain(
      '- **Date:** 2026-03-01'
    );
  });
});
