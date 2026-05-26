/**
 * MCP tool: `mcp__harness__test_craft`.
 *
 * Wraps test-craft (craft-pipeline #3).
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Surface area → MCP tool).
 */

import { runTestCraft, type TestCraftInput, type TestCraftOutput } from '../../test-craft/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const testCraftDefinition = {
  name: 'test_craft',
  description:
    'LLM-judgment critique of test quality across vitest/jest/mocha/playwright. Fourth ' +
    'craft-pipeline ceiling skill; 8 seed rubrics. Per-test critique with optional source ' +
    'pairing for contract-vs-implementation rubrics.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional test file/glob scope',
      },
      frameworks: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['vitest', 'jest', 'mocha', 'playwright'],
        },
        description: 'Restrict to specific frameworks (default: all four)',
      },
      maxFiles: { type: 'number', description: 'Cap test file count (default: 100)' },
      maxTestsPerFile: {
        type: 'number',
        description: 'Cap per-file test critique (default: 20)',
      },
      sourcePair: {
        type: 'boolean',
        description: 'Resolve source file under test for richer prompt context (default: true)',
      },
    },
    required: ['path'],
  },
};

export async function handleTestCraft(input: TestCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'test_craft: `path` is required' }) },
      ],
      isError: true,
    };
  }
  try {
    const result: TestCraftOutput = await runTestCraft(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `test_craft failed: ${message}` }) }],
      isError: true,
    };
  }
}

export { runTestCraft } from '../../test-craft/index.js';
export type { TestCraftInput, TestCraftOutput } from '../../test-craft/index.js';
