import { describe, it, expect } from 'vitest';
import type { Shard } from '../../../src/roadmap/store/roadmap-store';
import { parseShard, serializeShard } from '../../../src/roadmap/store/shard';
import { SHARD, SHARD_MD, SHARD_MD_BAD_ORDER, SHARD_MD_MISSING_SLUG, feat } from './fixtures';

describe('parseShard()', () => {
  it('parses frontmatter + row block into a Shard', () => {
    const r = parseShard(SHARD_MD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(SHARD);
      expect(typeof r.value.order).toBe('number');
    }
  });

  it('errors on non-numeric order', () => {
    const r = parseShard(SHARD_MD_BAD_ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/order/i);
  });

  it('errors on missing slug', () => {
    const r = parseShard(SHARD_MD_MISSING_SLUG);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/slug/i);
  });
});

describe('serializeShard()', () => {
  it('is byte-stable: serializeShard(parseShard(MD).value) === MD', () => {
    const r = parseShard(SHARD_MD);
    if (!r.ok) throw r.error;
    expect(serializeShard(r.value)).toBe(SHARD_MD);
  });

  it('round-trips from the Shard fixture', () => {
    const md = serializeShard(SHARD);
    const r = parseShard(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(SHARD);
  });

  // B1 regression: free-form scalars (milestone, slug) must be emitted with safe
  // YAML quoting so colons / boolean-looking / number-looking values round-trip.
  it('B1: round-trips a milestone name containing a colon', () => {
    const shard: Shard = {
      slug: 'colon-milestone',
      milestone: 'Maintenance: Lint & Deps',
      order: 1,
      feature: feat('Colon milestone', 'planned'),
    };
    const md = serializeShard(shard);
    const r = parseShard(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(shard);
  });

  it('B1: keeps boolean-/number-looking free-form scalars as strings', () => {
    const shard: Shard = {
      slug: '123',
      milestone: 'true',
      order: 2,
      feature: feat('Weird scalars', 'planned'),
    };
    const md = serializeShard(shard);
    const r = parseShard(md);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.value.slug).toBe('string');
      expect(r.value.slug).toBe('123');
      expect(typeof r.value.milestone).toBe('string');
      expect(r.value.milestone).toBe('true');
    }
  });

  it('B1: escapes quotes and backslashes in free-form scalars', () => {
    const shard: Shard = {
      slug: 'escaping',
      milestone: 'He said "hi" \\ bye',
      order: 3,
      feature: feat('Escaping', 'planned'),
    };
    const md = serializeShard(shard);
    const r = parseShard(md);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.milestone).toBe('He said "hi" \\ bye');
  });
});
