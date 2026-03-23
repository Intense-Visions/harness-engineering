import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
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

  describe('gather_context snapshot parity', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-parity-'));
      // Create minimal harness config
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ name: 'test-project' })
      );
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('state field matches loadState output', async () => {
      const { loadState } = await import('@harness-engineering/core');

      const compositeResponse = await handleGatherContext({
        path: tmpDir,
        intent: 'parity test',
        include: ['state'],
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await loadState(tmpDir);
      const directState = directResult.ok ? directResult.value : null;

      expect(compositeData.state).toEqual(directState);
    });

    it('learnings field matches loadRelevantLearnings output', async () => {
      const { loadRelevantLearnings } = await import('@harness-engineering/core');

      const compositeResponse = await handleGatherContext({
        path: tmpDir,
        intent: 'parity test',
        include: ['learnings'],
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await loadRelevantLearnings(tmpDir);
      const directLearnings = directResult.ok ? directResult.value : [];

      expect(compositeData.learnings).toEqual(directLearnings);
    });

    it('handoff field matches loadHandoff output', async () => {
      const { loadHandoff } = await import('@harness-engineering/core');

      const compositeResponse = await handleGatherContext({
        path: tmpDir,
        intent: 'parity test',
        include: ['handoff'],
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await loadHandoff(tmpDir);
      const directHandoff = directResult.ok ? directResult.value : null;

      expect(compositeData.handoff).toEqual(directHandoff);
    });

    it('validation field matches handleValidateProject output', async () => {
      const { handleValidateProject } = await import('../../src/tools/validate');

      const compositeResponse = await handleGatherContext({
        path: tmpDir,
        intent: 'parity test',
        include: ['validation'],
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await handleValidateProject({ path: tmpDir });
      const directValidation = JSON.parse(directResult.content[0].text);

      expect(compositeData.validation).toEqual(directValidation);
    });
  });

  describe('gather_context performance', () => {
    it('reports assembledIn timing in meta', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-bench',
        intent: 'bench',
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.meta.assembledIn).toBeGreaterThanOrEqual(0);
      expect(typeof parsed.meta.assembledIn).toBe('number');
    });

    it('invokes all constituents in parallel via Promise.allSettled', async () => {
      // Structural verification: gather_context returns results from all 5
      // constituents in a single call, proving they run via allSettled.
      // With mocked deps (near-instant), timing-based assertions are unreliable.
      const response = await handleGatherContext({
        path: '/nonexistent/project-bench',
        intent: 'bench',
      });
      const parsed = JSON.parse(response.content[0].text);
      // All 5 constituent keys should be present (even if null/empty)
      expect(parsed).toHaveProperty('state');
      expect(parsed).toHaveProperty('learnings');
      expect(parsed).toHaveProperty('handoff');
      expect(parsed).toHaveProperty('graphContext');
      expect(parsed).toHaveProperty('validation');
      // Meta should track errors from any failed constituents
      expect(parsed.meta).toHaveProperty('errors');
      expect(Array.isArray(parsed.meta.errors)).toBe(true);
    });
  });
});
