/**
 * MCP tool: `mcp__harness__align_design_system`.
 *
 * Wraps the align-design-system skill (design-pipeline sub-project #1,
 * align half — paired with detect-design-drift). Applies safe codemods
 * for clear 1:1 token replacements and emits suggestions for findings
 * that require human or LLM judgment.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Surface area → MCP tool).
 */

import {
  runAlignDesignSystem,
  type AlignInput,
  type AlignDesignSystemOutput,
} from '../../align/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const alignDesignSystemDefinition = {
  name: 'align_design_system',
  description:
    'Apply codemods for DRIFT-T001/T002/T003 (hex/font/spacing tokens) where pre-flight ' +
    'classifier deems the change safe; emit precise suggestions for DRIFT-T004 (deprecated ' +
    'tokens) and all DRIFT-P* (primitive adoption). Runs standalone (invokes detect-design-drift ' +
    'internally) or as the FIX step in a pipeline (reads pipeline.driftFindings from handoff.json).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      dryRun: {
        type: 'boolean',
        description:
          'Compute diffs without writing to disk. Default: false (write is the default).',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (standalone mode passes through to detect-design-drift).',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Overrides design.strictness from harness.config.json.',
      },
      mode: {
        type: 'string',
        enum: ['standalone', 'pipeline'],
        description:
          'standalone (default): runs detect internally. pipeline: reads pipeline.driftFindings from .harness/handoff.json and writes pipeline.fixesApplied back.',
      },
      fixBatch: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of finding keys (CODE@file:line) to limit application to a subset. Honored in pipeline mode.',
      },
      revert: {
        type: 'boolean',
        description:
          'When true, inverse-applies the most-recent batch recorded at .harness/align/last-batch.json instead of detecting + classifying + applying. Skips files edited externally since the apply.',
      },
    },
    required: ['path'],
  },
};

export async function handleAlignDesignSystem(input: AlignInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'align_design_system: `path` is required' }),
        },
      ],
      isError: true,
    };
  }
  try {
    const result: AlignDesignSystemOutput = await runAlignDesignSystem(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `align_design_system failed: ${message}` }),
        },
      ],
      isError: true,
    };
  }
}

export { runAlignDesignSystem } from '../../align/index.js';
export type { AlignInput, AlignDesignSystemOutput, FixOutcome } from '../../align/index.js';
