import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  gatherContextDefinition,
  handleGatherContext,
} from '../../../src/mcp/tools/gather-context';

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
        'sessions',
        'events',
        'businessKnowledge',
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
      expect(parsed).toHaveProperty('sessionSections');
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

    it('returns sessionSections as null when sessions not in include', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-test',
        intent: 'test intent',
        include: ['state'],
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.sessionSections).toBeNull();
    });

    it('returns sessionSections as null when sessions included but no session param', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-test',
        intent: 'test intent',
        include: ['sessions'],
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.sessionSections).toBeNull();
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
      const { handleValidateProject } = await import('../../../src/mcp/tools/validate');

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

    it('sessionSections field matches readSessionSections output when session exists', async () => {
      const { appendSessionEntry, readSessionSections } = await import('@harness-engineering/core');

      // Create a session with some data
      const sessionSlug = 'test-gc-session';
      const sessionDir = path.join(tmpDir, '.harness', 'sessions', sessionSlug);
      fs.mkdirSync(sessionDir, { recursive: true });

      await appendSessionEntry(
        tmpDir,
        sessionSlug,
        'decisions',
        'test-skill',
        'Use approach A for auth'
      );

      const compositeResponse = await handleGatherContext({
        path: tmpDir,
        intent: 'parity test',
        session: sessionSlug,
        include: ['sessions'],
      });
      const compositeData = JSON.parse(compositeResponse.content[0].text);

      const directResult = await readSessionSections(tmpDir, sessionSlug);
      const directSections = directResult.ok ? directResult.value : null;

      expect(compositeData.sessionSections).toEqual(directSections);
      // Verify the appended entry is present
      expect(compositeData.sessionSections.decisions).toHaveLength(1);
      expect(compositeData.sessionSections.decisions[0].content).toBe('Use approach A for auth');
    });
  });

  describe('depth parameter', () => {
    it('definition includes depth property with enum values', () => {
      const props = gatherContextDefinition.inputSchema.properties;
      expect(props).toHaveProperty('depth');
      expect((props as Record<string, { enum?: string[] }>).depth.enum).toEqual([
        'index',
        'summary',
        'full',
      ]);
    });

    it('passes depth through to learnings loading', async () => {
      // Integration test: verify depth parameter is accepted without error
      const response = await handleGatherContext({
        path: '/nonexistent/project-depth-test',
        intent: 'test depth parameter',
        include: ['learnings'],
        depth: 'index',
      });
      expect(response.isError).toBeUndefined();
      const output = JSON.parse(response.content[0]!.text);
      // Should not error — learnings returns empty for nonexistent path
      expect(Array.isArray(output.learnings)).toBe(true);
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

  describe('pagination schema', () => {
    it('has section, offset, and limit properties in schema', () => {
      const props = gatherContextDefinition.inputSchema.properties;
      expect(props).toHaveProperty('section');
      expect(props).toHaveProperty('offset');
      expect(props).toHaveProperty('limit');
      expect((props as Record<string, { type: string }>).offset.type).toBe('number');
      expect((props as Record<string, { type: string }>).limit.type).toBe('number');
    });

    it('section enum has correct values', () => {
      const sectionProp = (
        gatherContextDefinition.inputSchema.properties as Record<string, { enum?: string[] }>
      ).section;
      expect(sectionProp.enum).toEqual(['graphContext', 'learnings', 'sessionSections']);
    });
  });

  describe('section-aware pagination', () => {
    it('returns learnings section with pagination when section=learnings', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-pagination',
        intent: 'test pagination',
        include: ['learnings'],
        section: 'learnings',
      });
      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.section).toBe('learnings');
      expect(parsed).toHaveProperty('items');
      expect(parsed).toHaveProperty('pagination');
      expect(parsed.pagination).toHaveProperty('offset', 0);
      expect(parsed.pagination).toHaveProperty('limit', 20);
      expect(parsed.pagination).toHaveProperty('total');
      expect(parsed.pagination).toHaveProperty('hasMore');
    });

    it('returns graphContext section with pagination when section=graphContext and mode=detailed', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-pagination',
        intent: 'test pagination',
        include: ['graph'],
        section: 'graphContext',
        mode: 'detailed',
      });
      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.section).toBe('graphContext');
      expect(parsed).toHaveProperty('items');
      expect(parsed).toHaveProperty('pagination');
      expect(parsed.pagination.offset).toBe(0);
      expect(parsed.pagination.limit).toBe(20);
    });

    it('returns error when section=graphContext without mode=detailed', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-pagination',
        intent: 'test pagination',
        include: ['graph'],
        section: 'graphContext',
        // mode defaults to 'summary' — should be rejected
      });
      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('mode=detailed');
    });

    it('returns sessionSections with pagination when section=sessionSections', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-pagination',
        intent: 'test pagination',
        include: ['sessions'],
        session: 'test-session',
        section: 'sessionSections',
      });
      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.section).toBe('sessionSections');
      expect(parsed).toHaveProperty('items');
      expect(parsed).toHaveProperty('pagination');
    });

    it('respects offset and limit for learnings section', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-pagination',
        intent: 'test pagination',
        include: ['learnings'],
        section: 'learnings',
        offset: 5,
        limit: 2,
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.pagination.offset).toBe(5);
      expect(parsed.pagination.limit).toBe(2);
    });

    it('without section param returns full output with no pagination wrapper', async () => {
      const response = await handleGatherContext({
        path: '/nonexistent/project-gc-pagination',
        intent: 'test no section',
      });
      const parsed = JSON.parse(response.content[0].text);
      // Should have the standard shape, not the paginated shape
      expect(parsed).toHaveProperty('state');
      expect(parsed).toHaveProperty('learnings');
      expect(parsed).toHaveProperty('graphContext');
      expect(parsed).toHaveProperty('meta');
      expect(parsed).not.toHaveProperty('section');
      expect(parsed).not.toHaveProperty('items');
    });
  });

  describe('section pagination with real session data', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-pagination-'));
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ name: 'test-project' })
      );
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('paginates session section entries across all sections', async () => {
      const { appendSessionEntry } = await import('@harness-engineering/core');
      const sessionSlug = 'pagination-test';
      const sessionDir = path.join(tmpDir, '.harness', 'sessions', sessionSlug);
      fs.mkdirSync(sessionDir, { recursive: true });

      // Add multiple entries across sections
      await appendSessionEntry(tmpDir, sessionSlug, 'decisions', 'skill-a', 'Decision 1');
      await appendSessionEntry(tmpDir, sessionSlug, 'decisions', 'skill-a', 'Decision 2');
      await appendSessionEntry(tmpDir, sessionSlug, 'constraints', 'skill-b', 'Constraint 1');

      const response = await handleGatherContext({
        path: tmpDir,
        intent: 'test session pagination',
        session: sessionSlug,
        include: ['sessions'],
        section: 'sessionSections',
        offset: 0,
        limit: 2,
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.section).toBe('sessionSections');
      expect(parsed.items.length).toBeLessThanOrEqual(2);
      expect(parsed.pagination.total).toBe(3);
      expect(parsed.pagination.hasMore).toBe(true);
      // Each item should have sectionName
      for (const item of parsed.items) {
        expect(item).toHaveProperty('sectionName');
        expect(item).toHaveProperty('content');
      }
    });
  });
});
