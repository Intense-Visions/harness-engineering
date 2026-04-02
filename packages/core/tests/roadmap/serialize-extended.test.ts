import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import {
  EXTENDED_FIELDS_MD,
  EXTENDED_FIELDS_ROADMAP,
  HISTORY_MD,
  HISTORY_ROADMAP,
  VALID_ROADMAP_MD,
  VALID_ROADMAP,
} from './fixtures';

describe('serializeRoadmap() — extended fields', () => {
  it('serializes assignee, priority, external-id when present', () => {
    const result = serializeRoadmap(EXTENDED_FIELDS_ROADMAP);
    expect(result).toContain('- **Assignee:** @cwarner');
    expect(result).toContain('- **Priority:** P1');
    expect(result).toContain('- **External-ID:** github:harness-eng/harness#42');
  });

  it('omits new fields when all are null (legacy output)', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    expect(result).not.toContain('**Assignee:**');
    expect(result).not.toContain('**Priority:**');
    expect(result).not.toContain('**External-ID:**');
  });

  it('uses em-dash for null assignee when other extended fields present', () => {
    const result = serializeRoadmap(EXTENDED_FIELDS_ROADMAP);
    // Graph Connector has assignee: null but priority: P2
    expect(result).toContain('- **Assignee:** \u2014');
    expect(result).toContain('- **Priority:** P2');
  });

  it('serializes assignment history table', () => {
    const result = serializeRoadmap(HISTORY_ROADMAP);
    expect(result).toContain('## Assignment History');
    expect(result).toContain('| Core Library Design | @cwarner | assigned | 2026-03-15 |');
    expect(result).toContain('| Core Library Design | @cwarner | completed | 2026-04-01 |');
  });

  it('omits assignment history section when empty', () => {
    const result = serializeRoadmap(VALID_ROADMAP);
    expect(result).not.toContain('Assignment History');
  });

  it('round-trips: parse then serialize extended fields', () => {
    const parseResult = parseRoadmap(EXTENDED_FIELDS_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(EXTENDED_FIELDS_MD);
  });

  it('round-trips: parse then serialize with assignment history', () => {
    const parseResult = parseRoadmap(HISTORY_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(HISTORY_MD);
  });

  it('round-trips: legacy roadmap unchanged after type extension', () => {
    const parseResult = parseRoadmap(VALID_ROADMAP_MD);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    const serialized = serializeRoadmap(parseResult.value);
    expect(serialized).toBe(VALID_ROADMAP_MD);
  });
});
