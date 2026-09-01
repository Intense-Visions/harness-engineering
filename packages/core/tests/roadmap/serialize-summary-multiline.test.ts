import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { encodeSummaryField, decodeSummaryField } from '../../src/roadmap/summary-field';
import { VALID_ROADMAP } from './fixtures';

// Regression guard for #1756: `RoadmapFeature.summary` used to round-trip lossily
// through `serializeRoadmap` → `parseRoadmap`. The grammar is line-oriented
// (`- **Summary:** <value>` on one line, read back by a per-line non-dotAll
// regex), so a summary carrying an embedded newline split across two markdown
// lines on write and had its continuation silently dropped on the next parse.
//
// Before the fix these assertions FAIL (the reparsed summary is truncated to its
// first line); after the escape codec is wired into `serializeFeature` /
// `parseFeatureBlock` they PASS. The sibling comma-in-list bug (#1757) is a
// SEPARATE grammar defect and is intentionally NOT exercised here.
describe('roadmap round-trip: multi-line summary (#1756)', () => {
  it('preserves a summary with an embedded newline through parse(serialize(roadmap))', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[0]!.summary =
      'Email and in-app notifications with polling\nfollow-up: add push channel';

    const markdown = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(markdown);

    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    // The whole roadmap (summary continuation included) survives intact.
    expect(reparsed.value).toEqual(roadmap);
    expect(reparsed.value.milestones[0]!.features[0]!.summary).toBe(
      'Email and in-app notifications with polling\nfollow-up: add push channel'
    );
  });

  it('keeps the multi-line summary stable across a second round-trip (idempotent)', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[0]!.summary = 'line one\nline two\r\nline three';

    const once = serializeRoadmap(roadmap);
    const twice = serializeRoadmap(
      (() => {
        const r = parseRoadmap(once);
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('parse failed');
        return r.value;
      })()
    );

    // Byte-stable regen: re-serializing the reparsed roadmap yields the same bytes.
    expect(twice).toBe(once);
  });

  it('does not split the summary bullet across markdown lines on write', () => {
    const roadmap = structuredClone(VALID_ROADMAP);
    roadmap.milestones[0]!.features[0]!.summary = 'first\nsecond';

    const markdown = serializeRoadmap(roadmap);
    const lines = markdown.split('\n');

    // The continuation is escaped onto the single Summary bullet rather than
    // leaking onto an orphan second markdown line.
    expect(lines).toContain('- **Summary:** first\\nsecond');
    expect(lines).not.toContain('second');
  });

  it('leaves a plain single-line summary byte-for-byte unchanged (legacy content)', () => {
    const plain = 'Email and in-app notifications with polling';
    expect(encodeSummaryField(plain)).toBe(plain);
    expect(decodeSummaryField(plain)).toBe(plain);
  });

  it('is an exact inverse for values containing backslashes and control chars', () => {
    for (const value of [
      'a\nb',
      'a\\nb', // a literal backslash-n, must NOT be mistaken for a newline
      'path\\to\\thing',
      'carriage\r\nreturn',
      'mixed \\ and \n and \\n',
      '',
    ]) {
      expect(decodeSummaryField(encodeSummaryField(value))).toBe(value);
    }
  });
});
