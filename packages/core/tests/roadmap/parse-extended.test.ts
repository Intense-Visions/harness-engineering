import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import {
  EXTENDED_FIELDS_MD,
  EXTENDED_FIELDS_ROADMAP,
  HISTORY_MD,
  HISTORY_ROADMAP,
  VALID_ROADMAP_MD,
} from './fixtures';

describe('parseRoadmap() — extended fields', () => {
  describe('assignee, priority, externalId', () => {
    it('parses all three new fields when present', () => {
      const result = parseRoadmap(EXTENDED_FIELDS_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const core = result.value.milestones[0]?.features[0];
      expect(core?.assignee).toBe('@cwarner');
      expect(core?.priority).toBe('P1');
      expect(core?.externalId).toBe('github:harness-eng/harness#42');
    });

    it('parses em-dash as null for new fields', () => {
      const result = parseRoadmap(EXTENDED_FIELDS_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const graph = result.value.milestones[0]?.features[1];
      expect(graph?.assignee).toBeNull();
      expect(graph?.priority).toBe('P2');
      expect(graph?.externalId).toBeNull();
    });

    it('defaults new fields to null when absent (legacy roadmap)', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const feature = result.value.milestones[0]?.features[0];
      expect(feature?.assignee).toBeNull();
      expect(feature?.priority).toBeNull();
      expect(feature?.externalId).toBeNull();
    });

    it('parses the full extended roadmap to match expected object', () => {
      const result = parseRoadmap(EXTENDED_FIELDS_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(EXTENDED_FIELDS_ROADMAP);
    });

    it('returns Err for invalid priority value', () => {
      const md = EXTENDED_FIELDS_MD.replace('P1', 'P5');
      const result = parseRoadmap(md);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/priority/i);
    });
  });

  describe('assignment history', () => {
    it('parses assignment history table into AssignmentRecord[]', () => {
      const result = parseRoadmap(HISTORY_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assignmentHistory).toHaveLength(2);
      expect(result.value.assignmentHistory[0]).toEqual({
        feature: 'Core Library Design',
        assignee: '@cwarner',
        action: 'assigned',
        date: '2026-03-15',
      });
    });

    it('does not treat Assignment History heading as a milestone', () => {
      const result = parseRoadmap(HISTORY_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.milestones).toHaveLength(1);
      expect(result.value.milestones[0]?.name).toBe('MVP Release');
    });

    it('produces empty assignmentHistory when section is absent', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assignmentHistory).toEqual([]);
    });

    it('parses the full history roadmap to match expected object', () => {
      const result = parseRoadmap(HISTORY_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(HISTORY_ROADMAP);
    });
  });
});
