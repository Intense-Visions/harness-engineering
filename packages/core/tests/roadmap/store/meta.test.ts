import { describe, it, expect } from 'vitest';
import type { RoadmapMeta } from '../../../src/roadmap/store/roadmap-store';
import { parseMeta, serializeMeta } from '../../../src/roadmap/store/meta';
import {
  META,
  META_MD,
  META_MD_MISSING_REQUIRED,
  META_MD_WITH_HISTORY,
  META_WITH_HISTORY,
} from './fixtures';

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

describe('_meta.md assignment-history body (Phase 2)', () => {
  it('parseMeta extracts the `## Assignment History` records; frontmatter + milestones unchanged', () => {
    const r = parseMeta(META_MD_WITH_HISTORY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.assignmentHistory).toEqual(META_WITH_HISTORY.assignmentHistory);
      expect(r.value.frontmatter).toEqual(META_WITH_HISTORY.frontmatter);
      expect(r.value.milestones).toEqual(META_WITH_HISTORY.milestones);
    }
  });

  it('is byte-stable with history: serializeMeta(parseMeta(MD).value) === MD', () => {
    const r = parseMeta(META_MD_WITH_HISTORY);
    if (!r.ok) throw r.error;
    expect(serializeMeta(r.value)).toBe(META_MD_WITH_HISTORY);
  });

  it('serializes a RoadmapMeta with assignmentHistory to the expected MD', () => {
    expect(serializeMeta(META_WITH_HISTORY)).toBe(META_MD_WITH_HISTORY);
  });

  it('no-history parity: META_MD round-trips byte-identically and emits no history section', () => {
    const r = parseMeta(META_MD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // No history => undefined/empty (toEqual ignores undefined; existing META has no key).
      expect(r.value.assignmentHistory ?? []).toEqual([]);
      expect(serializeMeta(r.value)).toBe(META_MD);
    }
  });
});
