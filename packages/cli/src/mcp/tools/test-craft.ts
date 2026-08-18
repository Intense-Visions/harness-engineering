/**
 * MCP tools for test-craft (craft-pipeline #3):
 *
 *   `test_craft` — runs the skill. With `mode: 'in-session'` (the default in
 *     Claude Code) it walks the project, builds prompts, persists run-state,
 *     and returns the prompts to the calling agent without invoking an LLM.
 *     With `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `test_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses, parsing them into TestFindings, and returning
 *     the standard TestCraftOutput.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md (Surface area → MCP tool)
 *   + the in-session two-step extension (docs/changes/test-craft-interactive/).
 */

import {
  runTestCraft,
  collectTestCraftPrompts,
  finalizeTestCraft,
  type TestCraftInput,
  type TestCraftOutput,
  type CollectPromptsOutput,
  type FinalizeTestCraftInput,
} from '../../test-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

type TestCraftMode = 'inline' | 'in-session';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const testCraftDefinition = {
  name: 'test_craft',
  description:
    'LLM-judgment critique of test quality across vitest/jest/mocha/playwright/pytest. Fourth ' +
    'craft-pipeline ceiling skill; 8 seed rubrics. Per-test critique with optional source ' +
    'pairing for contract-vs-implementation rubrics. ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call test_craft_finalize with the responses to get findings.',
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
          enum: ['vitest', 'jest', 'mocha', 'playwright', 'pytest'],
        },
        description: 'Restrict to specific frameworks (default: all five)',
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
      emitTo: {
        type: 'string',
        description:
          'Write a machine-readable per-test verdict report (JSON) to this path so downstream ' +
          'tooling can consume the findings; relative paths resolve against the project root ' +
          '(inline mode only)',
      },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call test_craft_finalize. ' +
          "'inline': run end-to-end via the configured provider (HARNESS_CRAFT_LLM).",
      },
      promptBudget: {
        type: 'number',
        description: 'Cap prompt count in in-session mode (default: 100)',
      },
    },
    required: ['path'],
  },
};

export const testCraftFinalizeDefinition = {
  name: 'test_craft_finalize',
  description:
    "Finalize a test_craft in-session run by submitting the calling agent's responses to the " +
    'prompts collected by test_craft. Returns the standard TestCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the test_craft collect call' },
      responses: {
        type: 'array',
        description:
          'Per-prompt responses. `raw` is the fenced JSON block the calling agent produced.',
        items: {
          type: 'object',
          properties: {
            promptId: { type: 'string' },
            raw: { type: 'string' },
          },
          required: ['promptId', 'raw'],
        },
      },
    },
    required: ['path', 'runId', 'responses'],
  },
};

function ok(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

function fail(text: string): ToolResponse {
  return { content: [{ type: 'text', text }], isError: true };
}

function effectiveMode(input: TestCraftInput & { mode?: TestCraftMode }): TestCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleTestCraft(
  input: TestCraftInput & { mode?: TestCraftMode; promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'test_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectTestCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: TestCraftOutput = await runTestCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `test_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeTestCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'test_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'test_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'test_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleTestCraftFinalize(
  input: FinalizeTestCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeTestCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `test_craft_finalize failed: ${message}` }));
  }
}

export {
  runTestCraft,
  collectTestCraftPrompts,
  finalizeTestCraft,
} from '../../test-craft/index.js';
export type {
  TestCraftInput,
  TestCraftOutput,
  CollectPromptsOutput,
  FinalizeTestCraftInput,
} from '../../test-craft/index.js';
