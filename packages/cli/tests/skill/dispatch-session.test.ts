import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getCurrentHead,
  readLastHead,
  writeLastHead,
  detectHeadDelta,
  sessionStartDispatch,
  formatDispatchBanner,
} from '../../src/skill/dispatch-session.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock dispatch engine
vi.mock('../../src/skill/dispatch-engine.js', () => ({
  dispatchSkillsFromGit: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { dispatchSkillsFromGit } from '../../src/skill/dispatch-engine.js';

const mockExecSync = vi.mocked(execSync);
const mockDispatch = vi.mocked(dispatchSkillsFromGit);

const TEST_DIR = path.join(process.cwd(), '.test-dispatch-session');
const LAST_HEAD_PATH = path.join(TEST_DIR, '.harness', 'dispatch-last-head.txt');

/**
 * Helper: make mockExecSync return the test dir for --show-toplevel and
 * the given headSha for rev-parse HEAD. Throws for any other command.
 */
function mockGitCalls(headSha: string, toplevel: string = TEST_DIR): void {
  mockExecSync.mockImplementation((cmd: string) => {
    if (typeof cmd === 'string' && cmd.includes('--show-toplevel')) return toplevel + '\n';
    if (typeof cmd === 'string' && cmd.includes('rev-parse HEAD')) return headSha + '\n';
    throw new Error(`unmocked command: ${cmd}`);
  });
}

describe('dispatch-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.mkdirSync(path.join(TEST_DIR, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('getCurrentHead', () => {
    it('returns HEAD sha when in git repo', () => {
      mockExecSync.mockReturnValue('abc123\n');
      expect(getCurrentHead('/project')).toBe('abc123');
    });

    it('returns null when not in git repo', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repo');
      });
      expect(getCurrentHead('/not-a-repo')).toBeNull();
    });
  });

  describe('readLastHead', () => {
    it('returns null when file does not exist', () => {
      mockGitCalls('unused');
      expect(readLastHead(TEST_DIR)).toBeNull();
    });

    it('reads and trims HEAD from file', () => {
      mockGitCalls('unused');
      fs.writeFileSync(LAST_HEAD_PATH, 'abc123\n', 'utf8');
      expect(readLastHead(TEST_DIR)).toBe('abc123');
    });
  });

  describe('writeLastHead', () => {
    it('writes HEAD to file', () => {
      mockGitCalls('unused');
      writeLastHead(TEST_DIR, 'def456');
      expect(fs.readFileSync(LAST_HEAD_PATH, 'utf8').trim()).toBe('def456');
    });

    it('creates .harness directory if missing', () => {
      const freshDir = path.join(TEST_DIR, 'sub');
      mockGitCalls('unused', freshDir);
      writeLastHead(freshDir, 'ghi789');
      expect(
        fs.readFileSync(path.join(freshDir, '.harness', 'dispatch-last-head.txt'), 'utf8').trim()
      ).toBe('ghi789');
    });
  });

  describe('detectHeadDelta', () => {
    it('returns null when not in git repo', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repo');
      });
      expect(detectHeadDelta(TEST_DIR)).toBeNull();
    });

    it('returns null and writes HEAD on first run (no last-head file)', () => {
      mockGitCalls('abc123');
      expect(detectHeadDelta(TEST_DIR)).toBeNull();
      // Should have written the file
      expect(fs.readFileSync(LAST_HEAD_PATH, 'utf8').trim()).toBe('abc123');
    });

    it('returns null when HEAD unchanged', () => {
      fs.writeFileSync(LAST_HEAD_PATH, 'abc123\n', 'utf8');
      mockGitCalls('abc123');
      expect(detectHeadDelta(TEST_DIR)).toBeNull();
    });

    it('returns current HEAD when changed', () => {
      fs.writeFileSync(LAST_HEAD_PATH, 'abc123\n', 'utf8');
      mockGitCalls('def456');
      expect(detectHeadDelta(TEST_DIR)).toBe('def456');
    });
  });

  describe('sessionStartDispatch', () => {
    it('returns dispatched:false when HEAD unchanged', async () => {
      fs.writeFileSync(LAST_HEAD_PATH, 'abc123\n', 'utf8');
      mockGitCalls('abc123');

      const result = await sessionStartDispatch(TEST_DIR);
      expect(result.dispatched).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('dispatches and updates HEAD when changed', async () => {
      fs.writeFileSync(LAST_HEAD_PATH, 'abc123\n', 'utf8');
      mockGitCalls('def456');

      const dispatchResult = {
        context: {
          changeType: 'feature' as const,
          domains: [],
          signalCount: 1,
          snapshotFreshness: 'cached' as const,
        },
        skills: [
          {
            name: 'enforce-architecture',
            score: 0.8,
            urgency: 'recommended' as const,
            reason: 'feature change',
            parallelSafe: true,
            estimatedImpact: 'medium' as const,
          },
        ],
        generatedAt: '2026-04-06T00:00:00Z',
      };
      mockDispatch.mockResolvedValue(dispatchResult);

      const result = await sessionStartDispatch(TEST_DIR);
      expect(result.dispatched).toBe(true);
      expect(result.result).toEqual(dispatchResult);
      expect(result.currentHead).toBe('def456');
      // Should have updated the last-head file
      expect(fs.readFileSync(LAST_HEAD_PATH, 'utf8').trim()).toBe('def456');
    });

    it('returns dispatched:false when dispatch throws', async () => {
      fs.writeFileSync(LAST_HEAD_PATH, 'abc123\n', 'utf8');
      mockGitCalls('def456');
      mockDispatch.mockRejectedValue(new Error('snapshot failed'));

      const result = await sessionStartDispatch(TEST_DIR);
      expect(result.dispatched).toBe(false);
      // Should still update HEAD to avoid retrying
      expect(fs.readFileSync(LAST_HEAD_PATH, 'utf8').trim()).toBe('def456');
    });
  });

  describe('formatDispatchBanner', () => {
    it('returns null when not dispatched', () => {
      expect(formatDispatchBanner({ dispatched: false })).toBeNull();
    });

    it('returns null when no skills recommended', () => {
      expect(
        formatDispatchBanner({
          dispatched: true,
          result: {
            context: {
              changeType: 'feature',
              domains: [],
              signalCount: 0,
              snapshotFreshness: 'cached',
            },
            skills: [],
            generatedAt: '2026-04-06T00:00:00Z',
          },
        })
      ).toBeNull();
    });

    it('formats skills as banner lines', () => {
      const banner = formatDispatchBanner({
        dispatched: true,
        result: {
          context: {
            changeType: 'bugfix',
            domains: ['database'],
            signalCount: 3,
            snapshotFreshness: 'cached',
          },
          skills: [
            {
              name: 'tdd',
              score: 0.9,
              urgency: 'recommended',
              reason: 'bugfix',
              parallelSafe: true,
              estimatedImpact: 'high',
            },
            {
              name: 'security-scan',
              score: 0.7,
              urgency: 'critical',
              reason: 'findings',
              parallelSafe: false,
              estimatedImpact: 'high',
            },
          ],
          generatedAt: '2026-04-06T00:00:00Z',
        },
      });

      expect(banner).toContain('bugfix change');
      expect(banner).toContain('1 domain(s)');
      expect(banner).toContain('tdd');
      expect(banner).toContain('[parallel-safe]');
      expect(banner).toContain('! security-scan');
    });

    it('truncates to 3 skills with overflow message', () => {
      const skills = Array.from({ length: 5 }, (_, i) => ({
        name: `skill-${i}`,
        score: 0.5,
        urgency: 'recommended' as const,
        reason: 'test',
        parallelSafe: true,
        estimatedImpact: 'low' as const,
      }));

      const banner = formatDispatchBanner({
        dispatched: true,
        result: {
          context: {
            changeType: 'feature',
            domains: [],
            signalCount: 1,
            snapshotFreshness: 'cached',
          },
          skills,
          generatedAt: '2026-04-06T00:00:00Z',
        },
      });

      expect(banner).toContain('skill-0');
      expect(banner).toContain('skill-2');
      expect(banner).not.toContain('skill-3');
      expect(banner).toContain('and 2 more');
    });
  });
});
