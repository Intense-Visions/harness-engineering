# Plan: Scheduled Maintenance Phase 4 -- PR Manager

**Date:** 2026-04-17 | **Spec:** docs/changes/scheduled-maintenance/proposal.md | **Tasks:** 6 | **Time:** ~25 min

## Goal

PRManager provides branch lifecycle management (create, fetch, rebase, recreate on conflict) and PR lifecycle (create or update via `gh` CLI) for maintenance tasks, populating `prUrl` and `prUpdated` in RunResult.

## Observable Truths (Acceptance Criteria)

1. When `ensureBranch(branchName, baseBranch)` is called and the branch does not exist remotely, the system shall create a new local branch from `baseBranch` and return `{ created: true, recreated: false }`.
2. When `ensureBranch()` is called and the branch exists remotely, the system shall fetch it, check it out, and rebase onto `baseBranch`, returning `{ created: false, recreated: false }`.
3. When rebase fails during `ensureBranch()`, the system shall abort the rebase, delete the branch, recreate it from `baseBranch`, and return `{ created: false, recreated: true }`.
4. When `ensurePR(task, runSummary)` is called and no open PR exists on the branch, the system shall push commits and create a new PR via `gh pr create` with title `[Maintenance] <task.description>`, body containing the run summary, and labels `harness-maintenance` and `task.id`.
5. When `ensurePR(task, runSummary)` is called and an open PR already exists, the system shall push commits and update the PR body via `gh pr edit`, returning `{ prUpdated: true }`.
6. `npx vitest run packages/orchestrator/tests/maintenance/pr-manager.test.ts` passes with 10+ tests covering branch creation, fetch+rebase, rebase-failure-recreate, PR creation, and PR update.
7. TaskRunner integrates PRManager via DI: `runMechanicalAI` and `runPureAI` call `ensureBranch` before agent dispatch and `ensurePR` after successful agent commits, populating `prUrl` and `prUpdated` in RunResult.

## File Map

- CREATE `packages/orchestrator/src/maintenance/pr-manager.ts`
- CREATE `packages/orchestrator/tests/maintenance/pr-manager.test.ts`
- MODIFY `packages/orchestrator/src/maintenance/index.ts` (add PRManager + type exports)
- MODIFY `packages/orchestrator/src/maintenance/task-runner.ts` (add PRManager DI, call in execution paths)
- MODIFY `packages/orchestrator/tests/maintenance/task-runner.test.ts` (add mock PRManager, update assertions)

## Tasks

### Task 1: Create PRManager with GitExecutor and GhExecutor interfaces

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/pr-manager.ts`

Following the DI pattern from TaskRunner (CheckCommandRunner, AgentDispatcher, CommandExecutor), PRManager uses injectable interfaces for git and gh commands. This enables unit testing with mocks and avoids direct `execFile` calls in the class.

1. Create `packages/orchestrator/src/maintenance/pr-manager.ts` with:

```typescript
import type { TaskDefinition } from './types';

/**
 * Interface for executing git commands. Injected for testability.
 */
export interface GitExecutor {
  /** Run a git command and return stdout. Throws on non-zero exit. */
  run(args: string[], cwd: string): Promise<string>;
}

/**
 * Interface for executing gh CLI commands. Injected for testability.
 */
export interface GhExecutor {
  /** Run a gh command and return stdout. Throws on non-zero exit. */
  run(args: string[], cwd: string): Promise<string>;
}

export interface EnsureBranchResult {
  /** True if the branch was newly created (did not exist remotely). */
  created: boolean;
  /** True if the branch existed but was recreated due to rebase conflict. */
  recreated: boolean;
}

export interface EnsurePRResult {
  /** URL of the PR (created or existing). */
  prUrl: string;
  /** True if an existing PR was updated, false if newly created. */
  prUpdated: boolean;
}

export interface PRManagerOptions {
  git: GitExecutor;
  gh: GhExecutor;
  /** Project root directory for running commands. */
  cwd: string;
  /** Logger for debug/info messages. */
  logger: PRManagerLogger;
}

export interface PRManagerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  debug?(message: string, context?: Record<string, unknown>): void;
}

/**
 * PRManager handles branch lifecycle (create, fetch, rebase, recreate)
 * and PR lifecycle (create or update via gh CLI) for maintenance tasks.
 */
export class PRManager {
  private git: GitExecutor;
  private gh: GhExecutor;
  private cwd: string;
  private logger: PRManagerLogger;

  constructor(options: PRManagerOptions) {
    this.git = options.git;
    this.gh = options.gh;
    this.cwd = options.cwd;
    this.logger = options.logger;
  }

  /**
   * Ensure a maintenance branch exists and is up-to-date with the base branch.
   *
   * - If the branch does not exist remotely: create from baseBranch.
   * - If it exists: fetch, checkout, attempt rebase onto baseBranch.
   * - If rebase fails: abort rebase, delete branch, recreate from baseBranch.
   */
  async ensureBranch(branchName: string, baseBranch: string): Promise<EnsureBranchResult> {
    const remoteExists = await this.remoteBranchExists(branchName);

    if (!remoteExists) {
      this.logger.info('Creating new maintenance branch', { branchName, baseBranch });
      await this.git.run(['fetch', 'origin', baseBranch], this.cwd);
      await this.git.run(['checkout', '-b', branchName, `origin/${baseBranch}`], this.cwd);
      return { created: true, recreated: false };
    }

    // Branch exists remotely -- fetch and checkout
    this.logger.info('Fetching existing maintenance branch', { branchName });
    await this.git.run(['fetch', 'origin', branchName], this.cwd);
    await this.git.run(['checkout', branchName], this.cwd);
    await this.git.run(['reset', '--hard', `origin/${branchName}`], this.cwd);

    // Attempt rebase onto base branch
    await this.git.run(['fetch', 'origin', baseBranch], this.cwd);
    const rebaseSucceeded = await this.tryRebase(baseBranch);

    if (rebaseSucceeded) {
      return { created: false, recreated: false };
    }

    // Rebase failed -- recreate branch
    this.logger.warn('Rebase failed, recreating branch from base', { branchName, baseBranch });
    await this.git.run(['rebase', '--abort'], this.cwd);
    await this.git.run(['checkout', `origin/${baseBranch}`], this.cwd);
    await this.git.run(['branch', '-D', branchName], this.cwd);
    // Also delete the remote branch so we start fresh
    try {
      await this.git.run(['push', 'origin', '--delete', branchName], this.cwd);
    } catch {
      // Remote branch may already be gone; ignore
    }
    await this.git.run(['checkout', '-b', branchName, `origin/${baseBranch}`], this.cwd);
    return { created: false, recreated: true };
  }

  /**
   * Ensure a PR exists for the maintenance task's branch.
   *
   * - Push current commits to origin.
   * - If a PR already exists: update its body via gh pr edit.
   * - If no PR exists: create one via gh pr create.
   */
  async ensurePR(task: TaskDefinition, runSummary: string): Promise<EnsurePRResult> {
    const branchName = task.branch!;

    // Push commits to remote
    await this.git.run(['push', 'origin', branchName, '--force-with-lease'], this.cwd);

    // Check for existing PR
    const existingPrUrl = await this.findOpenPR(branchName);

    if (existingPrUrl) {
      this.logger.info('Updating existing maintenance PR', { branchName, prUrl: existingPrUrl });
      await this.gh.run(
        ['pr', 'edit', existingPrUrl, '--body', this.buildPRBody(task, runSummary)],
        this.cwd
      );
      return { prUrl: existingPrUrl, prUpdated: true };
    }

    // Create new PR
    this.logger.info('Creating new maintenance PR', { branchName });
    const title = `[Maintenance] ${task.description}`;
    const body = this.buildPRBody(task, runSummary);
    const prUrl = (
      await this.gh.run(
        [
          'pr',
          'create',
          '--head',
          branchName,
          '--title',
          title,
          '--body',
          body,
          '--label',
          'harness-maintenance',
          '--label',
          task.id,
        ],
        this.cwd
      )
    ).trim();

    return { prUrl, prUpdated: false };
  }

  /**
   * Check if a remote branch exists using git ls-remote.
   */
  private async remoteBranchExists(branchName: string): Promise<boolean> {
    try {
      const output = await this.git.run(['ls-remote', '--heads', 'origin', branchName], this.cwd);
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to rebase current branch onto baseBranch.
   * Returns true if rebase succeeded, false if conflicts arose.
   */
  private async tryRebase(baseBranch: string): Promise<boolean> {
    try {
      await this.git.run(['rebase', `origin/${baseBranch}`], this.cwd);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find an open PR for the given branch head.
   * Returns the PR URL if found, null otherwise.
   */
  private async findOpenPR(branchName: string): Promise<string | null> {
    try {
      const output = await this.gh.run(
        ['pr', 'list', '--head', branchName, '--json', 'url', '--jq', '.[0].url'],
        this.cwd
      );
      const url = output.trim();
      return url.length > 0 ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Build the PR body with task metadata and run summary.
   */
  private buildPRBody(task: TaskDefinition, runSummary: string): string {
    const lines = [
      '## Automated Maintenance PR',
      '',
      `**Task:** ${task.id}`,
      `**Type:** ${task.type}`,
      `**Schedule:** \`${task.schedule}\``,
      '',
      '## Latest Run Summary',
      '',
      runSummary,
      '',
      '---',
      '_This PR was created and managed automatically by the harness maintenance scheduler._',
    ];
    return lines.join('\n');
  }
}
```

2. Run: `npx harness validate` (from project root)
3. Commit: `feat(maintenance): add PRManager with branch and PR lifecycle`

---

### Task 2: Write tests for PRManager.ensureBranch()

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/pr-manager.test.ts`

1. Create `packages/orchestrator/tests/maintenance/pr-manager.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/pr-manager.test.ts`
3. Verify all 5 tests pass.
4. Commit: `test(maintenance): add PRManager.ensureBranch tests`

---

### Task 3: Write tests for PRManager.ensurePR()

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/pr-manager.test.ts`

1. Append the following `describe('ensurePR', ...)` block inside the existing `describe('PRManager', ...)` in `packages/orchestrator/tests/maintenance/pr-manager.test.ts`:

```typescript
describe('ensurePR', () => {
  it('creates new PR when none exists', async () => {
    const gh = createMockGh();
    const git = createMockGit();
    // gh pr list returns empty (no existing PR)
    (gh.run as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'list') return '';
      if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/org/repo/pull/42\n';
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
      if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/org/repo/pull/99\n';
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
      if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/org/repo/pull/50\n';
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
    (gh.run as ReturnType<typeof vi.fn>).mockResolvedValue('');
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
});
```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/pr-manager.test.ts`
3. Verify all 10 tests pass (5 ensureBranch + 5 ensurePR).
4. Commit: `test(maintenance): add PRManager.ensurePR tests`

---

### Task 4: Export PRManager from barrel index

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/maintenance/index.ts`

1. Modify `packages/orchestrator/src/maintenance/index.ts`:
   - Update the doc comment to note Phase 4 is complete.
   - Add the PRManager export block after the TaskRunner exports:

```typescript
export { PRManager } from './pr-manager';
export type {
  GitExecutor,
  GhExecutor,
  EnsureBranchResult,
  EnsurePRResult,
  PRManagerOptions,
  PRManagerLogger,
} from './pr-manager';
```

2. Run: `npx harness validate`
3. Commit: `feat(maintenance): export PRManager from barrel index`

---

### Task 5: Integrate PRManager into TaskRunner via DI

**Depends on:** Task 1, Task 4 | **Files:** `packages/orchestrator/src/maintenance/task-runner.ts`

The TaskRunner currently returns `prUrl: null` from `runMechanicalAI` and `runPureAI`. Add an optional `PRManager`-shaped interface to `TaskRunnerOptions` and call it in the execution paths when a branch exists.

1. Modify `packages/orchestrator/src/maintenance/task-runner.ts`:

   a. Add a new DI interface at the top of the file (after imports), keeping the same pattern as other interfaces:

   ```typescript
   /**
    * Interface for managing branches and PRs for maintenance tasks.
    * Matches PRManager's public API shape for DI.
    */
   export interface PRLifecycleManager {
     ensureBranch(
       branchName: string,
       baseBranch: string
     ): Promise<{ created: boolean; recreated: boolean }>;
     ensurePR(
       task: TaskDefinition,
       runSummary: string
     ): Promise<{ prUrl: string; prUpdated: boolean }>;
   }
   ```

   b. Add `prManager?: PRLifecycleManager` to `TaskRunnerOptions` (optional to maintain backward compatibility with existing tests).

   c. Add `private prManager: PRLifecycleManager | null` to the class, set in constructor: `this.prManager = options.prManager ?? null`.

   d. Add a `baseBranch` field to `TaskRunnerOptions`: `baseBranch?: string` (defaults to `'main'`). Set in constructor: `this.baseBranch = options.baseBranch ?? 'main'`.

   e. In `runMechanicalAI`, after findings are detected and before agent dispatch, add:

   ```typescript
   if (this.prManager) {
     await this.prManager.ensureBranch(task.branch, this.baseBranch);
   }
   ```

   f. In `runMechanicalAI`, after agent dispatch succeeds, replace the return with:

   ```typescript
   let prUrl: string | null = null;
   let prUpdated = false;
   if (this.prManager && agentResult.producedCommits) {
     const summary = `Findings: ${checkResult.findings}, Fixed: ${agentResult.fixed}`;
     const prResult = await this.prManager.ensurePR(task, summary);
     prUrl = prResult.prUrl;
     prUpdated = prResult.prUpdated;
   }

   return {
     taskId: task.id,
     startedAt,
     completedAt: new Date().toISOString(),
     status: 'success',
     findings: checkResult.findings,
     fixed: agentResult.fixed,
     prUrl,
     prUpdated,
   };
   ```

   g. In `runPureAI`, add the same `ensureBranch` call before agent dispatch and `ensurePR` call after:

   ```typescript
   if (this.prManager) {
     await this.prManager.ensureBranch(task.branch!, this.baseBranch);
   }
   ```

   And after dispatch:

   ```typescript
   let prUrl: string | null = null;
   let prUpdated = false;
   if (this.prManager && agentResult.producedCommits) {
     const summary = `Fixed: ${agentResult.fixed}`;
     const prResult = await this.prManager.ensurePR(task, summary);
     prUrl = prResult.prUrl;
     prUpdated = prResult.prUpdated;
   }

   return {
     taskId: task.id,
     startedAt,
     completedAt: new Date().toISOString(),
     status: agentResult.producedCommits ? 'success' : 'no-issues',
     findings: 0,
     fixed: agentResult.fixed,
     prUrl,
     prUpdated,
   };
   ```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts`
   - Existing tests should still pass since `prManager` is optional.
3. Run: `npx harness validate`
4. Commit: `feat(maintenance): integrate PRManager into TaskRunner via DI`

---

### Task 6: Update TaskRunner tests for PRManager integration

**Depends on:** Task 5 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`

1. Modify `packages/orchestrator/tests/maintenance/task-runner.test.ts`:

   a. Add import for the new type:

   ```typescript
   import type { PRLifecycleManager } from '../../src/maintenance/task-runner';
   ```

   b. Add a mock factory:

   ```typescript
   function createMockPRManager(prUrl?: string): PRLifecycleManager {
     return {
       ensureBranch: vi.fn().mockResolvedValue({ created: true, recreated: false }),
       ensurePR: vi.fn().mockResolvedValue({
         prUrl: prUrl ?? 'https://github.com/org/repo/pull/42',
         prUpdated: false,
       }),
     };
   }
   ```

   c. Add new test cases in the `mechanical-ai tasks` describe block:

   ```typescript
   it('calls prManager.ensureBranch and ensurePR when findings and agent commits exist', async () => {
     const prManager = createMockPRManager();
     const runner = new TaskRunner(
       createRunnerOptions({
         checkRunner: createMockCheckRunner({ findings: 3 }),
         agentDispatcher: createMockAgentDispatcher({ producedCommits: true, fixed: 2 }),
         prManager,
       })
     );

     const result = await runner.run(ARCH_TASK);

     expect(prManager.ensureBranch).toHaveBeenCalledWith('harness-maint/arch-fixes', 'main');
     expect(prManager.ensurePR).toHaveBeenCalledWith(
       ARCH_TASK,
       expect.stringContaining('Findings: 3')
     );
     expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
     expect(result.prUpdated).toBe(false);
     expect(result.status).toBe('success');
   });

   it('does not call ensurePR when agent produces no commits', async () => {
     const prManager = createMockPRManager();
     const runner = new TaskRunner(
       createRunnerOptions({
         checkRunner: createMockCheckRunner({ findings: 3 }),
         agentDispatcher: createMockAgentDispatcher({ producedCommits: false, fixed: 0 }),
         prManager,
       })
     );

     const result = await runner.run(ARCH_TASK);

     expect(prManager.ensureBranch).toHaveBeenCalled();
     expect(prManager.ensurePR).not.toHaveBeenCalled();
     expect(result.prUrl).toBeNull();
   });
   ```

   d. Add new test cases in the `pure-ai tasks` describe block:

   ```typescript
   it('calls prManager.ensureBranch and ensurePR when agent produces commits', async () => {
     const prManager = createMockPRManager('https://github.com/org/repo/pull/99');
     const pureAITask: TaskDefinition = {
       id: 'dead-code',
       type: 'pure-ai',
       description: 'Remove dead code',
       schedule: '0 2 * * 0',
       branch: 'harness-maint/dead-code',
       fixSkill: 'cleanup-dead-code',
     };
     const runner = new TaskRunner(
       createRunnerOptions({
         agentDispatcher: createMockAgentDispatcher({ producedCommits: true, fixed: 5 }),
         prManager,
       })
     );

     const result = await runner.run(pureAITask);

     expect(prManager.ensureBranch).toHaveBeenCalledWith('harness-maint/dead-code', 'main');
     expect(prManager.ensurePR).toHaveBeenCalledWith(
       pureAITask,
       expect.stringContaining('Fixed: 5')
     );
     expect(result.prUrl).toBe('https://github.com/org/repo/pull/99');
     expect(result.status).toBe('success');
   });
   ```

   e. Add a test verifying backward compatibility:

   ```typescript
   it('returns prUrl: null when no prManager is provided (backward compat)', async () => {
     const runner = new TaskRunner(
       createRunnerOptions({
         checkRunner: createMockCheckRunner({ findings: 3 }),
         agentDispatcher: createMockAgentDispatcher({ producedCommits: true, fixed: 2 }),
         // No prManager
       })
     );

     const result = await runner.run(ARCH_TASK);

     expect(result.prUrl).toBeNull();
     expect(result.status).toBe('success');
   });
   ```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts`
3. Run: `npx vitest run packages/orchestrator/tests/maintenance/pr-manager.test.ts`
4. Run: `npx harness validate`
5. Commit: `test(maintenance): add TaskRunner tests for PRManager integration`

---

## Dependency Graph

```
Task 1 (PRManager class)
  ├── Task 2 (ensureBranch tests) ──┐
  ├── Task 3 (ensurePR tests)       ├── can run in parallel
  └── Task 4 (barrel export) ───────┘
         │
         v
      Task 5 (TaskRunner integration)
         │
         v
      Task 6 (TaskRunner integration tests)
```

## Estimated Total

6 tasks, ~25 minutes.
