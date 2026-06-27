import { describe, it, expect } from 'vitest';
import type { RoadmapMeta } from '../../../src/roadmap/store/roadmap-store';
import { parseMeta, serializeMeta } from '../../../src/roadmap/store/meta';
import { META, META_MD, META_MD_MISSING_REQUIRED } from './fixtures';

describe('parseMeta()', () => {
  it('parses frontmatter + ordered milestones list', () => {
    const r = parseMeta(META_MD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(META);
      expect(typeof r.value.frontmatter.version).toBe('number');
      // ISO date strings stay strings (not coerced to Date objects).
      expect(typeof r.value.frontmatter.lastSynced).toBe('string');
      expect(r.value.milestones).toEqual(['MVP Release', 'v5.0 Hardening', 'Backlog']);
    }
  });

  it('errors on missing required frontmatter', () => {
    const r = parseMeta(META_MD_MISSING_REQUIRED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/last_synced|last_manual_edit|required/i);
  });
});

describe('serializeMeta()', () => {
  it('is byte-stable: serializeMeta(parseMeta(MD).value) === MD', () => {
    const r = parseMeta(META_MD);
    if (!r.ok) throw r.error;
    expect(serializeMeta(r.value)).toBe(META_MD);
  });

  it('round-trips from the RoadmapMeta fixture', () => {
    const md = serializeMeta(META);
    const r = parseMeta(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(META);
  });

  // B1 regression: milestone list items must be safely quoted so colon /
  // boolean-looking / number-looking names reparse as strings (not nested maps
  // or coerced scalars), and quotes/backslashes are escaped.
  it('B1: round-trips milestone names with colons, booleans, numbers, and escapes', () => {
    const meta: RoadmapMeta = {
      frontmatter: META.frontmatter,
      milestones: ['Maintenance: Lint & Deps', 'true', '123', 'He said "hi" \\ bye'],
    };
    const md = serializeMeta(meta);
    const r = parseMeta(md);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.milestones).toEqual([
        'Maintenance: Lint & Deps',
        'true',
        '123',
        'He said "hi" \\ bye',
      ]);
    }
  });
});
