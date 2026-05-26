/**
 * MCP tool: `mcp__harness__copy_craft`.
 *
 * Wraps copy-craft (craft-pipeline #5).
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Surface area → MCP tool).
 */

import { runCopyCraft, type CopyCraftInput, type CopyCraftOutput } from '../../copy-craft/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const copyCraftDefinition = {
  name: 'copy_craft',
  description:
    'LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines, ' +
    'CLI output strings, commit subjects, PR descriptions, code comments. Third craft-pipeline ' +
    'ceiling skill; 8 seed rubrics. Graceful degradation when git/gh prereqs absent.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional source file/glob scope',
      },
      surfaces: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['error', 'log', 'cli-output', 'commit', 'pr-description', 'comment'],
        },
        description: 'Restrict to specific surfaces (default: all 6)',
      },
      maxFiles: { type: 'number', description: 'Cap source file count (default: 100)' },
      maxItemsPerFile: { type: 'number', description: 'Cap per-file items (default: 20)' },
      commitsSince: {
        type: 'string',
        description: "Commit window for git log (default: '1 month ago')",
      },
      prLimit: { type: 'number', description: 'PR count cap (default: 20)' },
    },
    required: ['path'],
  },
};

export async function handleCopyCraft(input: CopyCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'copy_craft: `path` is required' }) },
      ],
      isError: true,
    };
  }
  try {
    const result: CopyCraftOutput = await runCopyCraft(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `copy_craft failed: ${message}` }) }],
      isError: true,
    };
  }
}

export { runCopyCraft } from '../../copy-craft/index.js';
export type { CopyCraftInput, CopyCraftOutput } from '../../copy-craft/index.js';
