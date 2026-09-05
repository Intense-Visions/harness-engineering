import * as path from 'path';
import { resolveProjectConfig } from '../utils/config-resolver.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const validateToolDefinition = {
  name: 'validate_project',
  description:
    'Run all validation checks on a harness engineering project. Pass `changed: true` ' +
    '(or `scope: "affected"`, or a `since` ref) to run the full harness validate with its ' +
    'file-walking design audits scoped to the git-derived changed surface instead of the ' +
    'whole tree — the same affected-mode the CLI exposes, for skills/agents that validate ' +
    'via MCP. Default (omitted) is unchanged.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      scope: {
        type: 'string',
        enum: ['affected', 'full'],
        description:
          "'affected' scopes the design walkers to the changed surface derived from git; " +
          "'full' (default) walks the whole tree. Equivalent to `changed`.",
      },
      changed: {
        type: 'boolean',
        description:
          'Alias for `scope: "affected"` — scope the design walkers to the changed surface.',
      },
      since: {
        type: 'string',
        description:
          'Scope the changed surface to files that differ from this ref (implies affected mode).',
      },
      defaultBranch: {
        type: 'string',
        description: 'Branch to compute the changed-surface merge-base against (default: main).',
      },
    },
    required: ['path'],
  },
};

export async function handleValidateProject(input: {
  path: string;
  scope?: 'affected' | 'full';
  changed?: boolean;
  since?: string;
  defaultBranch?: string;
}) {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  // Affected mode: delegate to the SAME `runValidate` the CLI uses so the
  // changed-surface scoping (validate-scope) is shared, not forked. This runs the
  // full harness validate with its design walkers scoped to the git-derived changed
  // surface (scoped ⊆ full). Opt-in only — when no scope/changed/since is passed the
  // thin default path below runs unchanged, so existing MCP callers are byte-identical.
  const affected =
    input.changed === true || input.scope === 'affected' || typeof input.since === 'string';
  if (affected) {
    // Dynamic import mirrors cross-check.ts and avoids a static commands↔mcp cycle.
    const { runValidate } = await import('../../commands/validate.js');
    const result = await runValidate({
      cwd: projectPath,
      changed: true,
      ...(typeof input.since === 'string' && { since: input.since }),
      ...(typeof input.defaultBranch === 'string' && { defaultBranch: input.defaultBranch }),
    });
    if (!result.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result.value) }],
    };
  }

  const errors: string[] = [];
  const checks: {
    config: 'pass' | 'fail';
    // `abstained` is distinct from `skipped`: skipped means no conventions were
    // configured at all, abstained means conventions exist but none is marked
    // required, so the check ran over an empty population and verified nothing
    // (#1530). Neither is a pass, and only one of them is the operator's bug.
    structure: 'pass' | 'fail' | 'skipped' | 'abstained';
    agentsMap: 'pass' | 'fail' | 'skipped';
  } = {
    config: 'fail',
    structure: 'skipped',
    agentsMap: 'skipped',
  };

  // 1. Load config
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) {
    errors.push(`Config: ${configResult.error.message}`);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, checks, errors }) }],
    };
  }
  checks.config = 'pass';
  const config = configResult.value;

  // 2. Run validateFileStructure if conventions are available
  try {
    const core = await import('@harness-engineering/core');
    if (
      typeof core.validateFileStructure === 'function' &&
      Array.isArray((config as Record<string, unknown>).conventions)
    ) {
      const conventions = (config as Record<string, unknown>).conventions as Array<{
        pattern: string;
        required: boolean;
        description: string;
        examples: string[];
      }>;
      const structureResult = await core.validateFileStructure(projectPath, conventions);
      if (structureResult.ok) {
        if (structureResult.value.abstained) {
          checks.structure = 'abstained';
          errors.push(
            'ABSTAINED: no file-structure convention is marked `required`, so the ' +
              'structure check compared nothing. This is an abstention, not a pass — ' +
              'mark at least one convention `required`, or remove the conventions block.'
          );
        } else {
          checks.structure = structureResult.value.valid ? 'pass' : 'fail';
          for (const missing of structureResult.value.missing) {
            errors.push(`Missing required file: ${missing}`);
          }
        }
      } else {
        checks.structure = 'fail';
        errors.push(`Structure validation error: ${structureResult.error.message}`);
      }
    }
  } catch {
    // core not available, skip
  }

  // 3. Run validateAgentsMap
  try {
    const core = await import('@harness-engineering/core');
    if (typeof core.validateAgentsMap === 'function') {
      const agentsMapPath = path.join(projectPath, 'AGENTS.md');
      const agentsResult = await core.validateAgentsMap(agentsMapPath);
      if (agentsResult.ok) {
        checks.agentsMap = agentsResult.value.valid ? 'pass' : 'fail';
        if (!agentsResult.value.valid) {
          if (agentsResult.value.missingSections.length > 0) {
            errors.push(
              `AGENTS.md missing sections: ${agentsResult.value.missingSections.join(', ')}`
            );
          }
          if (agentsResult.value.brokenLinks.length > 0) {
            errors.push(`AGENTS.md has ${agentsResult.value.brokenLinks.length} broken link(s)`);
          }
        }
      } else {
        checks.agentsMap = 'fail';
        errors.push(`AGENTS.md validation error: ${agentsResult.error.message}`);
      }
    }
  } catch {
    // core not available, skip
  }

  const valid = errors.length === 0;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ valid, checks, errors }) }],
  };
}
