/**
 * MCP tool: `mcp__harness__naming_craft`.
 *
 * Wraps naming-craft (craft-pipeline #1).
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Surface area → MCP tool).
 */

import {
  runNamingCraft,
  type NamingCraftInput,
  type NamingCraftOutput,
} from '../../naming-craft/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const namingCraftDefinition = {
  name: 'naming_craft',
  description:
    'LLM-judgment critique of identifier names (variables, functions, types, files). ' +
    'First craft-pipeline ceiling skill; uses a curated rubric catalog seeded from ' +
    'Martin / Beck / Karlton. Emits 3-axis findings (tier x impact x confidence per ADR 0019).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file/glob scope',
      },
      kinds: {
        type: 'array',
        items: { type: 'string', enum: ['variable', 'function', 'type', 'file'] },
        description: 'Restrict to specific identifier kinds (default: all)',
      },
      maxFiles: { type: 'number', description: 'Cap file count (default: 100)' },
      maxIdentifiersPerFile: {
        type: 'number',
        description: 'Cap per-file identifier sampling (default: 15)',
      },
    },
    required: ['path'],
  },
};

export async function handleNamingCraft(input: NamingCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'naming_craft: `path` is required' }) },
      ],
      isError: true,
    };
  }
  try {
    const result: NamingCraftOutput = await runNamingCraft(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: `naming_craft failed: ${message}` }) },
      ],
      isError: true,
    };
  }
}

export { runNamingCraft } from '../../naming-craft/index.js';
export type { NamingCraftInput, NamingCraftOutput } from '../../naming-craft/index.js';
