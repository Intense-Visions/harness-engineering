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
});
