import { describe, it, expect, vi } from 'vitest';
import { PRManager } from '../../src/maintenance/pr-manager';
import type {
  GitExecutor,
  GhExecutor,
  PRManagerLogger,
  PRManagerOptions,
} from '../../src/maintenance/pr-manager';
import type { TaskDefinition } from '../../src/maintenance/types';

function createMockGit(): GitExecutor {
  return { run: vi.fn().mockResolvedValue('') };
}

function createMockGh(): GhExecutor {
  return { run: vi.fn().mockResolvedValue('') };
}

function createMockLogger(): PRManagerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

function createPRManager(overrides?: Partial<PRManagerOptions>): {
  prManager: PRManager;
  git: GitExecutor;
  gh: GhExecutor;
  logger: PRManagerLogger;
} {
  const git = overrides?.git ?? createMockGit();
  const gh = overrides?.gh ?? createMockGh();
  const logger = overrides?.logger ?? createMockLogger();
  const cwd = overrides?.cwd ?? '/test/project';
  const prManager = new PRManager({ git, gh, cwd, logger });
  return { prManager, git, gh, logger };
}

const ARCH_TASK: TaskDefinition = {
  id: 'arch-violations',
  type: 'mechanical-ai',
  description: 'Detect and fix architecture violations',
  schedule: '0 2 * * *',
  branch: 'harness-maint/arch-fixes',
  checkCommand: ['check-arch'],
  fixSkill: 'harness-arch-fix',
};

describe('PRManager', () => {
  describe('ensureBranch', () => {
    it('creates new branch when remote does not exist', async () => {
      const git = createMockGit();
      // ls-remote returns empty (no remote branch)
      (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-remote') return '';
        return '';
      });
      const { prManager } = createPRManager({ git });

      const result = await prManager.ensureBranch('harness-maint/arch-fixes', 'main');

      expect(result).toEqual({ created: true, recreated: false });
      expect(git.run).toHaveBeenCalledWith(['fetch', 'origin', 'main'], '/test/project');
      expect(git.run).toHaveBeenCalledWith(
        ['checkout', '-b', 'harness-maint/arch-fixes', 'origin/main'],
        '/test/project'
      );
    });

    it('fetches and rebases when remote branch exists', async () => {
      const git = createMockGit();
      (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-remote') return 'abc123\trefs/heads/harness-maint/arch-fixes';
        return '';
      });
      const { prManager } = createPRManager({ git });

      const result = await prManager.ensureBranch('harness-maint/arch-fixes', 'main');

      expect(result).toEqual({ created: false, recreated: false });
      expect(git.run).toHaveBeenCalledWith(
        ['fetch', 'origin', 'harness-maint/arch-fixes'],
        '/test/project'
      );
      expect(git.run).toHaveBeenCalledWith(
        ['checkout', 'harness-maint/arch-fixes'],
        '/test/project'
      );
      expect(git.run).toHaveBeenCalledWith(['rebase', 'origin/main'], '/test/project');
      // Verify destructive reset --hard and base branch fetch
      expect(git.run).toHaveBeenCalledWith(
        ['reset', '--hard', 'origin/harness-maint/arch-fixes'],
        '/test/project'
      );
      expect(git.run).toHaveBeenCalledWith(['fetch', 'origin', 'main'], '/test/project');
    });

    it('recreates branch when rebase fails', async () => {
      const git = createMockGit();
      (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-remote') return 'abc123\trefs/heads/harness-maint/arch-fixes';
        if (args[0] === 'rebase' && args[1] === 'origin/main') {
          throw new Error('CONFLICT');
        }
        return '';
      });
      const { prManager } = createPRManager({ git });

      const result = await prManager.ensureBranch('harness-maint/arch-fixes', 'main');

      expect(result).toEqual({ created: false, recreated: true });
      expect(git.run).toHaveBeenCalledWith(['rebase', '--abort'], '/test/project');
      // Must checkout detached HEAD before deleting current branch
      expect(git.run).toHaveBeenCalledWith(['checkout', 'origin/main'], '/test/project');
      expect(git.run).toHaveBeenCalledWith(
        ['branch', '-D', 'harness-maint/arch-fixes'],
        '/test/project'
      );
      expect(git.run).toHaveBeenCalledWith(
        ['checkout', '-b', 'harness-maint/arch-fixes', 'origin/main'],
        '/test/project'
      );
    });

    it('handles ls-remote failure gracefully (treats as non-existent)', async () => {
      const git = createMockGit();
      (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-remote') throw new Error('network error');
        return '';
      });
      const { prManager } = createPRManager({ git });

      const result = await prManager.ensureBranch('harness-maint/arch-fixes', 'main');

      expect(result).toEqual({ created: true, recreated: false });
    });

    it('ignores failure when deleting remote branch during recreate', async () => {
      const git = createMockGit();
      let rebaseAttempted = false;
      (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'ls-remote') return 'abc123\trefs/heads/harness-maint/arch-fixes';
        if (args[0] === 'rebase' && args[1] === 'origin/main') {
          rebaseAttempted = true;
          throw new Error('CONFLICT');
        }
        if (args[0] === 'push' && args[2] === '--delete') {
          throw new Error('remote branch already deleted');
        }
        return '';
      });
      const { prManager } = createPRManager({ git });

      const result = await prManager.ensureBranch('harness-maint/arch-fixes', 'main');

      expect(rebaseAttempted).toBe(true);
      expect(result).toEqual({ created: false, recreated: true });
    });
  });

  describe('ensurePR', () => {
    it('creates new PR when none exists', async () => {
      const gh = createMockGh();
      const git = createMockGit();
      // gh pr list returns empty (no existing PR)
      (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'list') return '';
        if (args[0] === 'pr' && args[1] === 'create')
          return 'https://github.com/org/repo/pull/42\n';
        return '';
      });
      const { prManager } = createPRManager({ git, gh });

      const result = await prManager.ensurePR(ARCH_TASK, 'Found 3 violations, fixed 2');

      expect(result).toEqual({
        prUrl: 'https://github.com/org/repo/pull/42',
        prUpdated: false,
      });
      expect(git.run).toHaveBeenCalledWith(
        ['push', 'origin', 'harness-maint/arch-fixes', '--force-with-lease'],
        '/test/project'
      );
      expect(gh.run).toHaveBeenCalledWith(
        expect.arrayContaining([
          'pr',
          'create',
          '--title',
          '[Maintenance] Detect and fix architecture violations',
        ]),
        '/test/project'
      );
      // Verify labels
      const createCall = (gh.run as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: [string[], string]) => call[0][0] === 'pr' && call[0][1] === 'create'
      );
      expect(createCall![0]).toContain('--label');
      expect(createCall![0]).toContain('harness-maintenance');
      expect(createCall![0]).toContain('arch-violations');
    });

    it('updates existing PR when one exists', async () => {
      const gh = createMockGh();
      const git = createMockGit();
      (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'list') return 'https://github.com/org/repo/pull/42';
        return '';
      });
      const { prManager } = createPRManager({ git, gh });

      const result = await prManager.ensurePR(ARCH_TASK, 'Found 1 violation, fixed 1');

      expect(result).toEqual({
        prUrl: 'https://github.com/org/repo/pull/42',
        prUpdated: true,
      });
      expect(gh.run).toHaveBeenCalledWith(
        expect.arrayContaining(['pr', 'edit', 'https://github.com/org/repo/pull/42', '--body']),
        '/test/project'
      );
    });

    it('PR body contains task metadata and run summary', async () => {
      const gh = createMockGh();
      const git = createMockGit();
      (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'list') return '';
        if (args[0] === 'pr' && args[1] === 'create')
          return 'https://github.com/org/repo/pull/99\n';
        return '';
      });
      const { prManager } = createPRManager({ git, gh });

      await prManager.ensurePR(ARCH_TASK, 'Found 5 violations');

      const createCall = (gh.run as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: [string[], string]) => call[0][0] === 'pr' && call[0][1] === 'create'
      );
      const bodyIdx = createCall![0].indexOf('--body');
      const body = createCall![0][bodyIdx + 1] as string;
      expect(body).toContain('arch-violations');
      expect(body).toContain('mechanical-ai');
      expect(body).toContain('Found 5 violations');
      expect(body).toContain('harness maintenance scheduler');
    });

    it('handles gh pr list failure gracefully (treats as no PR)', async () => {
      const gh = createMockGh();
      const git = createMockGit();
      (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'list') throw new Error('gh auth error');
        if (args[0] === 'pr' && args[1] === 'create')
          return 'https://github.com/org/repo/pull/50\n';
        return '';
      });
      const { prManager } = createPRManager({ git, gh });

      const result = await prManager.ensurePR(ARCH_TASK, 'summary');

      expect(result.prUpdated).toBe(false);
      expect(result.prUrl).toBe('https://github.com/org/repo/pull/50');
    });

    it('uses --force-with-lease for push safety', async () => {
      const git = createMockGit();
      const gh = createMockGh();
      (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'list') return '';
        if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/org/repo/pull/1\n';
        return '';
      });
      const { prManager } = createPRManager({ git, gh });

      await prManager.ensurePR(ARCH_TASK, 'summary');

      expect(git.run).toHaveBeenCalledWith(
        ['push', 'origin', 'harness-maint/arch-fixes', '--force-with-lease'],
        '/test/project'
      );
    });

    it('propagates error when git push --force-with-lease fails', async () => {
      const git = createMockGit();
      const gh = createMockGh();
      (git.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'push') throw new Error('push rejected: stale ref');
        return '';
      });
      (gh.run as ReturnType<typeof vi.fn>).mockResolvedValue('');
      const { prManager } = createPRManager({ git, gh });

      await expect(prManager.ensurePR(ARCH_TASK, 'summary')).rejects.toThrow(
        'push rejected: stale ref'
      );
    });

    it('propagates error when gh pr create fails', async () => {
      const git = createMockGit();
      const gh = createMockGh();
      (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
        if (args[0] === 'pr' && args[1] === 'list') return '';
        if (args[0] === 'pr' && args[1] === 'create') {
          throw new Error('gh: label "harness-maintenance" not found');
        }
        return '';
      });
      const { prManager } = createPRManager({ git, gh });

      await expect(prManager.ensurePR(ARCH_TASK, 'summary')).rejects.toThrow(
        'label "harness-maintenance" not found'
      );
    });

    it('throws when task.branch is null', async () => {
      const nullBranchTask: TaskDefinition = { ...ARCH_TASK, branch: null };
      const { prManager } = createPRManager();

      await expect(prManager.ensurePR(nullBranchTask, 'summary')).rejects.toThrow(
        'ensurePR requires task.branch'
      );
    });
  });
});
