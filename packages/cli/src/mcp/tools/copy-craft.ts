/**
 * MCP tools for copy-craft (craft-pipeline #5):
 *
 *   `copy_craft` — runs the skill. With `mode: 'in-session'` (the default in
 *     Claude Code) it gathers copy items, builds prompts, persists run-state,
 *     and returns the prompts to the calling agent without invoking an LLM.
 *     With `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `copy_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses and returning the standard CopyCraftOutput.
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   + the in-session two-step extension.
 */

import {
  runCopyCraft,
  collectCopyCraftPrompts,
  finalizeCopyCraft,
  type CopyCraftInput,
  type CopyCraftOutput,
  type CopyCraftMode,
  type CollectPromptsOutput,
  type FinalizeCopyCraftInput,
} from '../../copy-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const copyCraftDefinition = {
  name: 'copy_craft',
  description:
    'LLM-judgment critique of prose-in-code across six surfaces: error messages, log lines, ' +
    'CLI output strings, commit subjects, PR descriptions, code comments. Third craft-pipeline ' +
    'ceiling skill; 8 seed rubrics. Graceful degradation when git/gh prereqs absent. ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call copy_craft_finalize with the responses to get findings.',
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
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call copy_craft_finalize. ' +
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

export const copyCraftFinalizeDefinition = {
  name: 'copy_craft_finalize',
  description:
    "Finalize a copy_craft in-session run by submitting the calling agent's responses to the " +
    'prompts collected by copy_craft. Returns the standard CopyCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the copy_craft collect call' },
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

function effectiveMode(input: CopyCraftInput): CopyCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleCopyCraft(
  input: CopyCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'copy_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectCopyCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: CopyCraftOutput = await runCopyCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `copy_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeCopyCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'copy_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'copy_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'copy_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleCopyCraftFinalize(
  input: FinalizeCopyCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeCopyCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `copy_craft_finalize failed: ${message}` }));
  }
}

export {
  runCopyCraft,
  collectCopyCraftPrompts,
  finalizeCopyCraft,
} from '../../copy-craft/index.js';
export type {
  CopyCraftInput,
  CopyCraftOutput,
  CollectPromptsOutput,
  FinalizeCopyCraftInput,
} from '../../copy-craft/index.js';
