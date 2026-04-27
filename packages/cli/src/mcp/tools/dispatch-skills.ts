import {
  dispatchSkillsFromGit,
  enrichSnapshotForDispatch,
  dispatchSkills,
} from '../../skill/dispatch-engine.js';

export const dispatchSkillsDefinition = {
  name: 'dispatch_skills',
  description:
    'Recommend an optimal skill sequence based on what changed in the codebase. Combines health signals with change-type and domain detection from git diffs. Returns an annotated sequence with parallel-safe flags, estimated impact, and dependency info.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path (defaults to cwd)',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Changed file paths (auto-detected from git diff if omitted)',
      },
      commitMessage: {
        type: 'string',
        description:
          'Commit message for change-type detection (auto-detected from git log if omitted)',
      },
      fresh: {
        type: 'boolean',
        description: 'Force a fresh health snapshot capture (default: false, uses cached)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of skills to return (default: 5)',
      },
      trigger: {
        type: 'string',
        description:
          'Filter to skills declaring this trigger (e.g. on_pr, on_commit, on_milestone, on_task_complete, on_refactor, on_review). Only skills whose triggers array includes this value are returned.',
      },
    },
    required: [],
  },
};

function buildEnrichOpts(
  files: string[] | undefined,
  commitMessage: string | undefined,
  fresh: boolean
): { files?: string[]; commitMessage?: string; fresh?: boolean } {
  const opts: { files?: string[]; commitMessage?: string; fresh?: boolean } = {};
  if (files) opts.files = files;
  if (commitMessage) opts.commitMessage = commitMessage;
  if (fresh) opts.fresh = fresh;
  return opts;
}

async function dispatchWithExplicitInput(
  projectRoot: string,
  files: string[] | undefined,
  commitMessage: string | undefined,
  fresh: boolean,
  limit: number,
  trigger?: string,
  skillTriggers?: Map<string, string[]>
) {
  const ctx = await enrichSnapshotForDispatch(
    projectRoot,
    buildEnrichOpts(files, commitMessage, fresh)
  );
  const dispatchOpts: { limit?: number; trigger?: string; skillTriggers?: Map<string, string[]> } =
    {};
  if (limit !== 5) dispatchOpts.limit = limit;
  if (trigger) dispatchOpts.trigger = trigger;
  if (skillTriggers) dispatchOpts.skillTriggers = skillTriggers;
  return dispatchSkills(ctx, dispatchOpts);
}

async function dispatchFromGit(
  projectRoot: string,
  fresh: boolean,
  limit: number,
  trigger?: string,
  skillTriggers?: Map<string, string[]>
) {
  const opts: {
    fresh?: boolean;
    limit?: number;
    trigger?: string;
    skillTriggers?: Map<string, string[]>;
  } = {};
  if (fresh) opts.fresh = fresh;
  if (limit !== 5) opts.limit = limit;
  if (trigger) opts.trigger = trigger;
  if (skillTriggers) opts.skillTriggers = skillTriggers;
  return dispatchSkillsFromGit(projectRoot, opts);
}

export async function handleDispatchSkills(
  input: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectRoot = (input.path as string) || process.cwd();
  const files = input.files as string[] | undefined;
  const commitMessage = input.commitMessage as string | undefined;
  const fresh = (input.fresh as boolean) ?? false;
  const limit = (input.limit as number) ?? 5;
  const trigger = input.trigger as string | undefined;

  try {
    // Load skill triggers map for trigger-based filtering
    let skillTriggers: Map<string, string[]> | undefined;
    if (trigger) {
      try {
        const { loadOrRebuildIndex } = await import('../../skill/index-builder.js');
        const index = loadOrRebuildIndex('claude-code', projectRoot);
        skillTriggers = new Map<string, string[]>();
        for (const [name, entry] of Object.entries(index.skills)) {
          skillTriggers.set(name, (entry as { triggers?: string[] }).triggers ?? ['manual']);
        }
      } catch {
        // Index unavailable — skip trigger filtering
      }
    }

    const hasExplicitInput = files !== undefined || commitMessage !== undefined;
    const result = hasExplicitInput
      ? await dispatchWithExplicitInput(
          projectRoot,
          files,
          commitMessage,
          fresh,
          limit,
          trigger,
          skillTriggers
        )
      : await dispatchFromGit(projectRoot, fresh, limit, trigger, skillTriggers);

    if (result.skills.length > limit) {
      result.skills = result.skills.slice(0, limit);
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dispatch error';
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }] };
  }
}
