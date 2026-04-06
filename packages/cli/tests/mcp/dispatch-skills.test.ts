import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchSkillsDefinition,
  handleDispatchSkills,
} from '../../src/mcp/tools/dispatch-skills.js';

// Mock the dispatch engine
vi.mock('../../src/skill/dispatch-engine.js', () => ({
  dispatchSkillsFromGit: vi.fn(),
  enrichSnapshotForDispatch: vi.fn(),
  dispatchSkills: vi.fn(),
}));

import {
  dispatchSkillsFromGit,
  enrichSnapshotForDispatch,
  dispatchSkills,
} from '../../src/skill/dispatch-engine.js';
const mockDispatchFromGit = vi.mocked(dispatchSkillsFromGit);
const mockEnrich = vi.mocked(enrichSnapshotForDispatch);
const mockDispatch = vi.mocked(dispatchSkills);

const EMPTY_RESULT = {
  context: {
    changeType: 'feature' as const,
    domains: [] as string[],
    signalCount: 0,
    snapshotFreshness: 'cached' as const,
  },
  skills: [] as Array<{
    name: string;
    score: number;
    urgency: 'recommended';
    reason: string;
    parallelSafe: boolean;
    estimatedImpact: 'medium';
  }>,
  generatedAt: '2026-04-06T00:00:00Z',
};

describe('dispatch_skills MCP tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('definition', () => {
    it('has correct tool name', () => {
      expect(dispatchSkillsDefinition.name).toBe('dispatch_skills');
    });

    it('has description mentioning skill sequence', () => {
      expect(dispatchSkillsDefinition.description).toContain('skill sequence');
    });

    it('defines all input properties', () => {
      const props = dispatchSkillsDefinition.inputSchema.properties;
      expect(props).toHaveProperty('path');
      expect(props).toHaveProperty('files');
      expect(props).toHaveProperty('commitMessage');
      expect(props).toHaveProperty('fresh');
      expect(props).toHaveProperty('limit');
    });

    it('has no required fields', () => {
      expect(dispatchSkillsDefinition.inputSchema.required).toEqual([]);
    });
  });

  describe('handler — auto-detect mode (no files/commitMessage)', () => {
    it('calls dispatchSkillsFromGit when no files or commitMessage provided', async () => {
      mockDispatchFromGit.mockResolvedValue(EMPTY_RESULT);

      await handleDispatchSkills({ path: '/test/project' });

      expect(mockDispatchFromGit).toHaveBeenCalledWith('/test/project', {});
      expect(mockEnrich).not.toHaveBeenCalled();
    });

    it('defaults to cwd when path not provided', async () => {
      mockDispatchFromGit.mockResolvedValue(EMPTY_RESULT);

      await handleDispatchSkills({});

      expect(mockDispatchFromGit).toHaveBeenCalledWith(process.cwd(), {});
    });

    it('passes fresh flag to dispatchSkillsFromGit', async () => {
      mockDispatchFromGit.mockResolvedValue(EMPTY_RESULT);

      await handleDispatchSkills({ fresh: true });

      expect(mockDispatchFromGit).toHaveBeenCalledWith(process.cwd(), { fresh: true });
    });
  });

  describe('handler — explicit mode (files or commitMessage provided)', () => {
    it('calls enrichSnapshotForDispatch + dispatchSkills when files provided', async () => {
      const fakeCtx = {} as never;
      mockEnrich.mockResolvedValue(fakeCtx);
      mockDispatch.mockReturnValue(EMPTY_RESULT);

      await handleDispatchSkills({
        path: '/test',
        files: ['src/foo.ts'],
      });

      expect(mockEnrich).toHaveBeenCalledWith('/test', { files: ['src/foo.ts'] });
      expect(mockDispatch).toHaveBeenCalledWith(fakeCtx, {});
      expect(mockDispatchFromGit).not.toHaveBeenCalled();
    });

    it('calls enrichSnapshotForDispatch + dispatchSkills when commitMessage provided', async () => {
      const fakeCtx = {} as never;
      mockEnrich.mockResolvedValue(fakeCtx);
      mockDispatch.mockReturnValue(EMPTY_RESULT);

      await handleDispatchSkills({
        path: '/test',
        commitMessage: 'feat: add foo',
      });

      expect(mockEnrich).toHaveBeenCalledWith('/test', { commitMessage: 'feat: add foo' });
      expect(mockDispatch).toHaveBeenCalledWith(fakeCtx, {});
    });

    it('passes fresh flag to enrichSnapshotForDispatch', async () => {
      const fakeCtx = {} as never;
      mockEnrich.mockResolvedValue(fakeCtx);
      mockDispatch.mockReturnValue(EMPTY_RESULT);

      await handleDispatchSkills({
        path: '/test',
        files: ['src/foo.ts'],
        fresh: true,
      });

      expect(mockEnrich).toHaveBeenCalledWith('/test', { files: ['src/foo.ts'], fresh: true });
    });
  });

  describe('handler — limit', () => {
    it('applies limit to results', async () => {
      const skills = Array.from({ length: 10 }, (_, i) => ({
        name: `skill-${i}`,
        score: 1 - i * 0.1,
        urgency: 'recommended' as const,
        reason: `reason ${i}`,
        parallelSafe: true,
        estimatedImpact: 'medium' as const,
      }));

      mockDispatchFromGit.mockResolvedValue({ ...EMPTY_RESULT, skills });

      const result = await handleDispatchSkills({ limit: 3 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.skills).toHaveLength(3);
    });

    it('defaults limit to 5', async () => {
      const skills = Array.from({ length: 10 }, (_, i) => ({
        name: `skill-${i}`,
        score: 1 - i * 0.1,
        urgency: 'recommended' as const,
        reason: `reason ${i}`,
        parallelSafe: true,
        estimatedImpact: 'medium' as const,
      }));

      mockDispatchFromGit.mockResolvedValue({ ...EMPTY_RESULT, skills });

      const result = await handleDispatchSkills({});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.skills).toHaveLength(5);
    });
  });

  describe('handler — errors', () => {
    it('returns error on dispatch failure', async () => {
      mockDispatchFromGit.mockRejectedValue(new Error('dispatch_skills requires a git repository'));

      const result = await handleDispatchSkills({ path: '/not/a/repo' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('dispatch_skills requires a git repository');
    });
  });

  describe('handler — output format', () => {
    it('returns content array with text type', async () => {
      mockDispatchFromGit.mockResolvedValue({
        ...EMPTY_RESULT,
        context: {
          changeType: 'bugfix' as const,
          domains: ['database'],
          signalCount: 3,
          snapshotFreshness: 'fresh' as const,
        },
        skills: [
          {
            name: 'tdd',
            score: 0.9,
            urgency: 'recommended' as const,
            reason: 'bugfix change + low-coverage',
            parallelSafe: true,
            estimatedImpact: 'medium' as const,
          },
        ],
      });

      const result = await handleDispatchSkills({ path: '/test' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.context.changeType).toBe('bugfix');
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0].name).toBe('tdd');
    });
  });
});
