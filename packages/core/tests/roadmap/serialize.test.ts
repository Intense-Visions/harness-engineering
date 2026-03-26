import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { VALID_ROADMAP, VALID_ROADMAP_MD, EMPTY_BACKLOG, EMPTY_BACKLOG_MD } from './fixtures';

describe('serializeRoadmap()', () => {
  it('serializes a full roadmap to expected markdown', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    expect(result).toBe(VALID_ROADMAP_MD);
  });

  it('serializes an empty backlog roadmap', () => {
    const result = serializeRoadmap(EMPTY_BACKLOG);
    expect(result).toBe(EMPTY_BACKLOG_MD);
  });

  it('uses em-dash for null spec', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    // Performance Baselines has null spec
    expect(result).toContain('- **Spec:** \u2014');
  });

  it('uses em-dash for empty plans array', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    // User Auth Revamp has empty plans
    expect(result).toContain('- **Plan:** \u2014');
  });

  it('round-trips: parse then serialize produces identical output', () => {
    const parseResult = parseRoadmap(VALID_ROADMAP_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(VALID_ROADMAP_MD);
  });

  it('round-trips the empty backlog case', () => {
    const parseResult = parseRoadmap(EMPTY_BACKLOG_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(EMPTY_BACKLOG_MD);
  });
});
