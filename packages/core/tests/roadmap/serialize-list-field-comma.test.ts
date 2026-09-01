import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { encodeListItem, decodeListField } from '../../src/roadmap/list-field';
import { VALID_ROADMAP } from './fixtures';

// Regression guard for #1757: the `Blocked by` / `Plan` roadmap list fields used
// to round-trip lossily through `serializeRoadmap` → `parseRoadmap`. `listOrDash`
// joined a feature's array with ", " and `parseListField` split the re-read value
// back on "," with NO escaping, so a single list item that itself contained a
// comma — e.g. a feature name authored via the MCP `manage_roadmap` write path,
// "Notification System, phase 2" — split into TWO items on the next parse,
// silently fabricating a blocker (or plan step) that never existed.
//
// Before the fix the round-trip assertions FAIL (one authored item comes back as
// two); after the reversible comma-escape codec is wired into `serializeFeature`
// / `parseFeatureBlock` they PASS. The sibling multi-line summary bug (#1756) is a
// SEPARATE grammar defect and is intentionally NOT exercised here.
describe('roadmap round-trip: comma inside a list item (#1757)', () => {
  it('preserves a blockedBy item containing a comma through parse(serialize(roadmap))', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[1]!.blockedBy = ['Notification System, phase 2'];

    const reparsed = parseRoadmap(serializeRoadmap(roadmap));

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // The whole roadmap survives intact — the one blocker stays one blocker.
    expect(reparsed.value).toEqual(roadmap);
    expect(reparsed.value.milestones[0]!.features[1]!.blockedBy).toEqual([
      'Notification System, phase 2',
    ]);
  });

  it('preserves a plan item containing a comma, and keeps sibling items separate', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[0]!.plans = [
      'Ship email, in-app, and push channels',
      'docs/plans/2026-03-15-notification-phase-2-plan.md',
    ];

    const reparsed = parseRoadmap(serializeRoadmap(roadmap));

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // The comma-bearing item stays whole AND the genuine ", " item boundary still
    // splits: two authored items round-trip as exactly two items.
    expect(reparsed.value.milestones[0]!.features[0]!.plans).toEqual([
      'Ship email, in-app, and push channels',
      'docs/plans/2026-03-15-notification-phase-2-plan.md',
    ]);
  });

  it('keeps a comma-bearing list item stable across a second round-trip (idempotent)', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[1]!.blockedBy = ['Auth, SSO, and MFA', 'Billing'];

    const once = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(once);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    const twice = serializeRoadmap(reparsed.value);

    // Byte-stable regen: re-serializing the reparsed roadmap yields the same bytes.
    expect(twice).toBe(once);
  });

  it('escapes the embedded comma onto the single Blockers bullet on write', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[1]!.blockedBy = ['Notification System, phase 2'];

    const lines = serializeRoadmap(roadmap).split('\n');

    // The comma is escaped in place rather than read back as an item boundary.
    expect(lines).toContain('- **Blockers:** Notification System\\, phase 2');
  });

  it('leaves plain comma-free list items byte-for-byte unchanged (legacy content)', () => {
    // A path with no comma and no backslash is an identity under the codec, so
    // existing roadmaps re-serialize to the exact same bytes.
    const roadmap = structuredClone(VALID_ROADMAP);
    const once = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(once);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(serializeRoadmap(reparsed.value)).toBe(once);
    expect(encodeListItem('docs/plans/a-plan.md')).toBe('docs/plans/a-plan.md');
  });

  it('decodeListField is an exact inverse of encodeListItem for tricky values', () => {
    for (const items of [
      ['a, b'],
      ['a', 'b'],
      ['trailing comma,'],
      ['path\\to\\thing'], // a bare backslash must survive untouched
      ['back\\, slash then comma'],
      ['多, 语言'],
      [''],
    ]) {
      const encoded = items.map(encodeListItem).join(', ');
      expect(decodeListField(encoded)).toEqual(items);
    }
  });
});
