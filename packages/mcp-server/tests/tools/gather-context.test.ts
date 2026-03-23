import { describe, it, expect } from 'vitest';
import { gatherContextDefinition, handleGatherContext } from '../../src/tools/gather-context';

describe('gather_context tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(gatherContextDefinition.name).toBe('gather_context');
    });

    it('requires path and intent', () => {
      expect(gatherContextDefinition.inputSchema.required).toContain('path');
      expect(gatherContextDefinition.inputSchema.required).toContain('intent');
    });

    it('has optional skill, tokenBudget, include, mode properties', () => {
      const props = gatherContextDefinition.inputSchema.properties;
      expect(props).toHaveProperty('skill');
      expect(props).toHaveProperty('tokenBudget');
      expect(props).toHaveProperty('include');
      expect(props).toHaveProperty('mode');
    });

    it('include enum has all constituent names', () => {
      const includeProp = gatherContextDefinition.inputSchema.properties.include;
      expect(includeProp.items.enum).toEqual([
        'state',
        'learnings',
        'handoff',
        'graph',
        'validation',
      ]);
    });

    it('mode defaults to summary for composite', () => {
      const modeProp = gatherContextDefinition.inputSchema.properties.mode;
      expect(modeProp.enum).toEqual(['summary', 'detailed']);
    });
  });

  describe('handler', () => {
    it('returns all fields with nulls for nonexistent project (graceful degradation)', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-test',
        intent: 'test intent',
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('state');
      expect(parsed).toHaveProperty('learnings');
      expect(parsed).toHaveProperty('handoff');
      expect(parsed).toHaveProperty('graphContext');
      expect(parsed).toHaveProperty('validation');
      expect(parsed).toHaveProperty('meta');
      expect(parsed.meta).toHaveProperty('assembledIn');
      expect(parsed.meta).toHaveProperty('graphAvailable');
      expect(parsed.meta).toHaveProperty('tokenEstimate');
      expect(parsed.meta).toHaveProperty('errors');
    });

    it('respects include filter -- only runs specified constituents', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-test',
        intent: 'test intent',
        include: ['state', 'learnings'],
      });
      const parsed = JSON.parse(response.content[0].text);
      // Excluded constituents should be null
      expect(parsed.graphContext).toBeNull();
      expect(parsed.validation).toBeNull();
      expect(parsed.handoff).toBeNull();
    });

    it('never throws -- returns partial results when constituents fail', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-test',
        intent: 'test',
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      // graphContext should be null (no graph dir)
      expect(parsed.graphContext).toBeNull();
      expect(parsed.meta.graphAvailable).toBe(false);
    });

    it('returns assembledIn > 0', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-test',
        intent: 'test',
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.meta.assembledIn).toBeGreaterThanOrEqual(0);
    });
  });
});
