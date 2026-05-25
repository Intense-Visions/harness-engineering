/**
 * MCP tool: `mcp__harness__run_design_pipeline`.
 *
 * Wraps the design-pipeline orchestrator (sub-project #5).
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Surface area → MCP tool).
 */

import {
  runDesignPipeline,
  type DesignPipelineInput,
  type DesignPipelineContext,
} from '../../design-pipeline/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const designPipelineDefinition = {
  name: 'run_design_pipeline',
  description:
    'Run the design-pipeline orchestrator: FRESHEN -> DETECT -> FIX -> AUDIT -> FILL -> REPORT. ' +
    'Composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, ' +
    'and design-craft-elevator into a phased pipeline with convergence-based remediation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      fix: { type: 'boolean', description: 'Enable convergence-based remediation' },
      noFreshen: { type: 'boolean', description: 'Skip FRESHEN phase' },
      noFill: { type: 'boolean', description: 'Skip FILL phase' },
      ci: {
        type: 'boolean',
        description: 'Non-interactive: safe fixes only, no prompts',
      },
      mode: {
        type: 'string',
        enum: ['fast', 'full'],
        description: 'Verifier mode passed to each composed verifier',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file/glob scope',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Override design.strictness',
      },
    },
    required: ['path'],
  },
};

export async function handleDesignPipeline(input: DesignPipelineInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'run_design_pipeline: `path` is required' }),
        },
      ],
      isError: true,
    };
  }
  try {
    const result: DesignPipelineContext = await runDesignPipeline(input);
    // Serialize Set -> array for transport
    const payload = { ...result, exclusions: [...result.exclusions] };
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `run_design_pipeline failed: ${message}` }),
        },
      ],
      isError: true,
    };
  }
}

export { runDesignPipeline } from '../../design-pipeline/index.js';
export type { DesignPipelineInput, DesignPipelineContext } from '../../design-pipeline/index.js';
