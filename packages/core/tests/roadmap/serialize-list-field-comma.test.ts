import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { encodeListItem, encodeListField, decodeListField } from '../../src/roadmap/list-field';
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

// Regression guard for #2162: the codec above was an exact inverse in ONE
// direction only. `decode(encode(items))` returned the items, which is what the
// suite above proves — but `encode(decode(raw))` did NOT return the raw text.
//
// Legacy `Plan` / `Blockers` values in the wild are not tidy tokens. They hold
// prose written by humans and agents, and prose is full of commas. Splitting on
// every bare comma and rejoining with ", " INSERTED A SPACE that was never in the
// file: `1,166` came back as `1, 166`. Because `manage_roadmap` round-trips the
// whole roadmap on every write, a single unrelated `add` silently rewrote rows
// nobody had touched — one project found 25 corruptions accumulated over weeks,
// including `146,585`, `250,000` and `$2,241`.
//
// Before the fix every assertion in this block FAILS. After it, a comma with no
// following whitespace is content in both directions and survives untouched.
describe('roadmap list fields: text round-trips unchanged (#2162)', () => {
  const roundTrip = (raw: string) => encodeListField(decodeListField(raw)) ?? '';

  it('does not split a thousands separator', () => {
    expect(roundTrip('Phase 2: backfill existing 3,777 films.')).toBe(
      'Phase 2: backfill existing 3,777 films.'
    );
    expect(roundTrip('credits are 146,585 not 91,432')).toBe('credits are 146,585 not 91,432');
    expect(roundTrip('~250,000 still-views or ~25,000 ten-round sessions')).toBe(
      '~250,000 still-views or ~25,000 ten-round sessions'
    );
  });

  it('leaves a bare comma unescaped rather than writing a backslash into prose', () => {
    // The other way to get this wrong: stop splitting on it but keep escaping it,
    // which puts `1\,166` in a file a person has to read.
    expect(encodeListItem('a 1,166-film backfill')).toBe('a 1,166-film backfill');
    expect(encodeListField(['a 1,166-film backfill'])).toBe('a 1,166-film backfill');
  });

  it('still treats ", " as a genuine item boundary', () => {
    expect(decodeListField('alpha, beta, gamma')).toEqual(['alpha', 'beta', 'gamma']);
    expect(roundTrip('alpha, beta, gamma')).toBe('alpha, beta, gamma');
  });

  it('is idempotent across repeated writes, which is how the damage accumulated', () => {
    // The corruption was cumulative: each write moved the text a little further.
    let text = 'a 1,166-film backfill plus a 3,625-film sweep';
    for (let i = 0; i < 5; i += 1) text = roundTrip(text);
    expect(text).toBe('a 1,166-film backfill plus a 3,625-film sweep');
  });

  it('round-trips the forms a naive repair regex would break', () => {
    // Both live in a real roadmap, and both match /\d, \d\d\d/.
    expect(roundTrip('shared in 1951, 1979, 1980, 1993 and 1997')).toBe(
      'shared in 1951, 1979, 1980, 1993 and 1997'
    );
    expect(roundTrip('the fix (v42, 2026-09-04 17:23)')).toBe('the fix (v42, 2026-09-04 17:23)');
  });

  it('preserves prose through a full parse(serialize(roadmap)) cycle', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[0]!.plans = ['Backfill the 3,605-film library, then sweep'];

    const once = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(once);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    expect(reparsed.value.milestones[0]!.features[0]!.plans).toEqual([
      'Backfill the 3,605-film library, then sweep',
    ]);
    expect(serializeRoadmap(reparsed.value)).toBe(once);
  });
});
