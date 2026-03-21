import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../src/roadmap/parse';
import {
  VALID_ROADMAP_MD,
  VALID_ROADMAP,
  NO_FRONTMATTER_MD,
  INVALID_STATUS_MD,
  EMPTY_BACKLOG_MD,
  EMPTY_BACKLOG,
} from './fixtures';

describe('parseRoadmap()', () => {
  describe('valid input', () => {
    it('parses frontmatter correctly', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.frontmatter).toEqual(VALID_ROADMAP.frontmatter);
    });

    it('parses milestones in document order', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.milestones).toHaveLength(3);
      expect(result.value.milestones.map((m) => m.name)).toEqual([
        'MVP Release',
        'Q3 Hardening',
        'Backlog',
      ]);
    });

    it('marks Backlog milestone with isBacklog: true', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const backlog = result.value.milestones[2];
      expect(backlog?.isBacklog).toBe(true);
      expect(backlog?.name).toBe('Backlog');
    });

    it('parses feature fields correctly', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const notif = result.value.milestones[0]?.features[0];
      expect(notif?.name).toBe('Notification System');
      expect(notif?.status).toBe('in-progress');
      expect(notif?.spec).toBe('docs/changes/notification-system/proposal.md');
      expect(notif?.plans).toHaveLength(2);
      expect(notif?.blockedBy).toEqual([]);
      expect(notif?.summary).toBe('Email and in-app notifications with polling');
    });

    it('parses blocked-by references', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const auth = result.value.milestones[0]?.features[1];
      expect(auth?.blockedBy).toEqual(['Notification System']);
    });

    it('treats em-dash as null/empty for spec, plans, blockedBy', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const perf = result.value.milestones[1]?.features[0];
      expect(perf?.spec).toBeNull();
      expect(perf?.plans).toEqual([]);
      expect(perf?.blockedBy).toEqual([]);
    });

    it('parses the full example to match expected object', () => {
      const result = parseRoadmap(VALID_ROADMAP_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(VALID_ROADMAP);
    });

    it('parses an empty backlog-only roadmap', () => {
      const result = parseRoadmap(EMPTY_BACKLOG_MD);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(EMPTY_BACKLOG);
    });
  });

  describe('invalid input', () => {
    it('returns Err when frontmatter is missing', () => {
      const result = parseRoadmap(NO_FRONTMATTER_MD);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/frontmatter/i);
    });

    it('returns Err when a feature has an invalid status', () => {
      const result = parseRoadmap(INVALID_STATUS_MD);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toMatch(/status/i);
    });
  });
});
