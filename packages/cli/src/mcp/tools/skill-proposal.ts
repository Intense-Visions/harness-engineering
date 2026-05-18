import { sanitizePath } from '../utils/sanitize-path.js';
import { type McpResponse, mcpError } from '../utils.js';
import type { ToolDefinition } from '../tool-types.js';

/**
 * Phase 4: emit_skill_proposal
 *
 * Captures an agent-emitted skill proposal (new skill or refinement of an
 * existing one) into `.harness/proposals/`. The proposal lands with
 * `status: open`; the soundness-review gate fires only when a human
 * approves (D3 in the phase spec) — emit never blocks the agent.
 */
export const emitSkillProposalDefinition: ToolDefinition = {
  name: 'emit_skill_proposal',
  description:
    'Emit a skill proposal (new-skill or refinement) into the review queue. Writes ' +
    '`.harness/proposals/<id>.json` and returns the queue URL. The proposal does not ' +
    'gate the agent — soundness-review runs at approval time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      kind: {
        type: 'string',
        enum: ['new-skill', 'refinement'],
        description: 'new-skill = full content; refinement = unified-diff against targetSkill',
      },
      targetSkill: {
        type: 'string',
        description: 'Existing skill name (required when kind is refinement)',
      },
      proposedBy: {
        type: 'string',
        description: 'Agent identifier, e.g. "claude-code:harness-execution"',
      },
      justification: {
        type: 'string',
        description: 'Why this skill / refinement is worth promoting (20–2000 chars)',
      },
      sessionId: { type: 'string', description: 'Originating session id (optional)' },
      taskId: { type: 'string', description: 'Originating maintenance task id (optional)' },
      content: {
        type: 'object',
        description: 'Proposal content. new-skill ⇒ skillYaml+skillMd; refinement ⇒ diff',
        properties: {
          name: {
            type: 'string',
            description: 'kebab-case skill name (matches /^[a-z][a-z0-9-]*$/, ≤64 chars)',
          },
          description: { type: 'string', description: '20–280 chars' },
          skillYaml: { type: 'string', description: 'Full skill.yaml (new-skill only)' },
          skillMd: { type: 'string', description: 'Full SKILL.md (new-skill only)' },
          diff: { type: 'string', description: 'Unified diff (refinement only)' },
        },
        required: ['name', 'description'],
      },
    },
    required: ['path', 'kind', 'proposedBy', 'justification', 'content'],
  },
};

interface EmitSkillProposalInput {
  path: string;
  kind: 'new-skill' | 'refinement';
  targetSkill?: string;
  proposedBy: string;
  justification: string;
  sessionId?: string;
  taskId?: string;
  content: {
    name: string;
    description: string;
    skillYaml?: string;
    skillMd?: string;
    diff?: string;
  };
}

export async function handleEmitSkillProposal(input: EmitSkillProposalInput): Promise<McpResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (err) {
    return mcpError(err instanceof Error ? err.message : 'Invalid path');
  }

  // Cross-field validation matrix matches SkillProposalSchema superRefine in
  // packages/types/src/proposals.ts. Surfacing here gives a focused message
  // before Zod's structural errors.
  if (input.kind === 'new-skill') {
    if (!input.content.skillYaml || !input.content.skillMd) {
      return mcpError('new-skill proposals require both skillYaml and skillMd');
    }
    if (input.targetSkill) {
      return mcpError('targetSkill is forbidden on new-skill proposals');
    }
    if (input.content.diff) {
      return mcpError('diff is forbidden on new-skill proposals (use skillYaml/skillMd)');
    }
  } else if (input.kind === 'refinement') {
    if (!input.targetSkill) {
      return mcpError('refinement proposals require targetSkill');
    }
    if (!input.content.diff) {
      return mcpError('refinement proposals require a unified diff');
    }
    if (input.content.skillYaml || input.content.skillMd) {
      return mcpError('skillYaml/skillMd are forbidden on refinement proposals (encode in diff)');
    }
  }

  let createProposal: typeof import('@harness-engineering/core').createProposal;
  let ProposalConflictError: typeof import('@harness-engineering/core').ProposalConflictError;
  try {
    const core = await import('@harness-engineering/core');
    createProposal = core.createProposal;
    ProposalConflictError = core.ProposalConflictError;
  } catch (err) {
    return mcpError(
      `Failed to load proposal store: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }

  try {
    const proposal = await createProposal(projectPath, {
      kind: input.kind,
      targetSkill: input.targetSkill,
      proposedBy: input.proposedBy,
      justification: input.justification,
      sessionId: input.sessionId,
      taskId: input.taskId,
      content: input.content,
    });

    const result = {
      id: proposal.id,
      path: `.harness/proposals/${proposal.id}.json`,
      queueUrl: '/s/proposals',
      status: proposal.status,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    if (err instanceof ProposalConflictError) {
      return mcpError(err.message);
    }
    return mcpError(
      `Failed to write proposal: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }
}
