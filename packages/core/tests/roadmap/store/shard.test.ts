import { describe, it, expect } from 'vitest';
import { parseShard, serializeShard } from '../../../src/roadmap/store/shard';
import { SHARD, SHARD_MD, SHARD_MD_BAD_ORDER, SHARD_MD_MISSING_SLUG } from './fixtures';

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
});
