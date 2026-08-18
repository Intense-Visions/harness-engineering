/**
 * MCP tools for spec-craft (craft-pipeline #6):
 *
 *   `spec_craft` — runs the skill. With `mode: 'in-session'` (the default in
 *     Claude Code) it walks the specs, builds prompts, persists run-state, and
 *     returns the prompts to the calling agent without invoking an LLM. With
 *     `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `spec_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses and returning the standard SpecCraftOutput.
 *
 * Source: docs/changes/craft-pipeline/spec-craft/proposal.md
 *   + the in-session two-step extension.
 */

import {
  runSpecCraft,
  collectSpecCraftPrompts,
  finalizeSpecCraft,
  type SpecCraftInput,
  type SpecCraftOutput,
  type SpecCraftMode,
  type CollectPromptsOutput,
  type FinalizeSpecCraftInput,
} from '../../spec-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const specCraftDefinition = {
  name: 'spec_craft',
  description:
    'LLM-judgment critique of spec quality (proposals + ADRs). Second craft-pipeline ' +
    'ceiling skill; 7 seed rubrics from the spec-quality canon. Per-section critique with ' +
    'rubric-to-section mapping. Emits 3-axis findings (tier x impact x confidence per ADR 0019). ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call spec_craft_finalize with the responses to get findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional spec file/glob scope',
      },
      kinds: {
        type: 'array',
        items: { type: 'string', enum: ['proposal', 'adr'] },
        description: 'Restrict to specific spec kinds (default: both)',
      },
      sections: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to canonical section names (e.g., decisions, scope)',
      },
      maxFiles: { type: 'number', description: 'Cap doc count (default: 50)' },
      maxSectionsPerFile: {
        type: 'number',
        description: 'Cap per-doc section critique (default: 10)',
      },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call spec_craft_finalize. ' +
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

export const specCraftFinalizeDefinition = {
  name: 'spec_craft_finalize',
  description:
    "Finalize a spec_craft in-session run by submitting the calling agent's responses to the " +
    'prompts collected by spec_craft. Returns the standard SpecCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the spec_craft collect call' },
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

function effectiveMode(input: SpecCraftInput): SpecCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleSpecCraft(
  input: SpecCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'spec_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectSpecCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: SpecCraftOutput = await runSpecCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `spec_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeSpecCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'spec_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'spec_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'spec_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleSpecCraftFinalize(
  input: FinalizeSpecCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeSpecCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `spec_craft_finalize failed: ${message}` }));
  }
}

export {
  runSpecCraft,
  collectSpecCraftPrompts,
  finalizeSpecCraft,
} from '../../spec-craft/index.js';
export type {
  SpecCraftInput,
  SpecCraftOutput,
  CollectPromptsOutput,
  FinalizeSpecCraftInput,
} from '../../spec-craft/index.js';
