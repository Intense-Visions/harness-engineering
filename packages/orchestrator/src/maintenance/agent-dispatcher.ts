import type { AgentBackend, Issue } from '@harness-engineering/types';
import { AgentRunner } from '../agent/runner';
import type { AgentDispatcher, AgentDispatchResult } from './task-runner';

/**
 * Dependencies for {@link createAgentDispatcher}. All side-effecting collaborators
 * are injected so the dispatcher is unit-testable with a MockBackend and a fake
 * git seam (no real agent process, no real repository).
 */
export interface AgentDispatcherDeps {
  /**
   * Resolve a configured backend by name (e.g. `'local'`, `'claude'`). Returns
   * `null` when the name is unknown/unconfigured — the dispatcher then no-ops
   * rather than throwing, so a misconfigured maintenance task degrades to
   * "produced nothing" instead of crashing the scheduler.
   */
  resolveBackend: (backendName: string) => AgentBackend | null;
  /** Run `git <args>` in `cwd`, returning trimmed stdout (throws on failure). */
  git: (args: string[], cwd: string) => string;
  /** Max agent turns per dispatch. Defaults to 10. */
  maxTurns?: number;
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * A throwaway Issue for the maintenance session. `AgentRunner.runSession` takes an
 * Issue for telemetry/labelling only (the parameter is otherwise unused), so the
 * maintenance run synthesizes a minimal one keyed on the branch.
 */
function syntheticIssue(branch: string, skill: string): Issue {
  return {
    id: `maintenance:${branch}`,
    identifier: branch,
    title: `Maintenance: ${skill}`,
    description: null,
    priority: null,
    state: 'in_progress',
    branchName: branch,
    url: null,
    labels: ['maintenance'],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
  };
}

function buildPrompt(skill: string, promptContext?: string): string {
  const instruction =
    `Run the \`${skill}\` skill to detect and fix issues in this repository. ` +
    `Apply the fixes and commit each logical change. If there is nothing to fix, make no commits.`;
  return promptContext ? `${promptContext}\n\n${instruction}` : instruction;
}

/** `git rev-parse HEAD` in cwd, or `null` when there is no commit yet. */
function headOf(git: AgentDispatcherDeps['git'], cwd: string): string | null {
  try {
    return git(['rev-parse', 'HEAD'], cwd) || null;
  } catch {
    return null;
  }
}

/**
 * Wire the maintenance {@link AgentDispatcher} to a real agent session.
 *
 * Replaces the previous stub (which only logged and returned `producedCommits:
 * false`). Resolves the named backend, drives a multi-turn {@link AgentRunner}
 * session over the skill prompt in the worktree, then measures whether the agent
 * actually committed anything by diffing `HEAD` before/after. Commit count — not
 * the agent's self-report — is the source of truth for `fixed`.
 */
export function createAgentDispatcher(deps: AgentDispatcherDeps): AgentDispatcher {
  const maxTurns = deps.maxTurns ?? 10;

  const dispatch = async (
    skill: string,
    branch: string,
    backendName: string,
    cwd: string,
    options?: { promptContext?: string }
  ): Promise<AgentDispatchResult> => {
    const backend = deps.resolveBackend(backendName);
    if (!backend) {
      deps.logger.warn(`Maintenance agent dispatch skipped: unknown backend "${backendName}"`, {
        skill,
        branch,
      });
      return { producedCommits: false, fixed: 0 };
    }

    const before = headOf(deps.git, cwd);

    const runner = new AgentRunner(backend, { maxTurns });
    const session = runner.runSession(
      syntheticIssue(branch, skill),
      cwd,
      buildPrompt(skill, options?.promptContext)
    );
    // Drain the session to completion. Per-turn AgentEvents are not surfaced
    // here (the maintenance reporter observes the commit outcome, not the
    // streaming transcript); we only need the run to finish.
    let step = await session.next();
    while (!step.done) step = await session.next();

    const after = headOf(deps.git, cwd);
    let fixed = 0;
    if (after && after !== before) {
      if (before) {
        try {
          fixed = parseInt(deps.git(['rev-list', '--count', `${before}..${after}`], cwd), 10) || 0;
        } catch {
          fixed = 1; // HEAD moved but the count failed — at least one commit landed.
        }
      } else {
        fixed = 1; // No prior HEAD (empty repo) and now there is one.
      }
    }

    const producedCommits = fixed > 0;
    deps.logger.info('Maintenance agent dispatch complete', {
      skill,
      branch,
      backendName,
      producedCommits,
      fixed,
    });
    return { producedCommits, fixed };
  };

  return { dispatch };
}
