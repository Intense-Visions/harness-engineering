/**
 * MCP tools for naming-craft (craft-pipeline #1):
 *
 *   `naming_craft` — runs the skill. With `mode: 'in-session'` it walks
 *     the project, builds prompts, persists run-state, and returns the
 *     prompts to the calling agent without invoking an LLM. With
 *     `mode: 'inline'` (or unset when HARNESS_CRAFT_LLM != 'in-session')
 *     it runs end-to-end against whichever provider is configured.
 *
 *   `naming_craft_finalize` — completes the in-session flow by consuming
 *     the calling agent's responses, parsing them into NamingFindings,
 *     and returning the standard NamingCraftOutput.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Surface area → MCP tool) + the in-session two-step extension.
 */

import {
  runNamingCraft,
  collectNamingCraftPrompts,
  finalizeNamingCraft,
  type NamingCraftInput,
  type NamingCraftOutput,
  type CollectPromptsOutput,
  type FinalizeNamingCraftInput,
  type NamingCraftMode,
} from '../../naming-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const namingCraftDefinition = {
  name: 'naming_craft',
  description:
    'LLM-judgment critique of identifier names (variables, functions, types, files). ' +
    'First craft-pipeline ceiling skill; uses a curated rubric catalog seeded from ' +
    'Martin / Beck / Karlton. Emits 3-axis findings (tier x impact x confidence per ADR 0019). ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call naming_craft_finalize with the responses to get findings.',
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
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call naming_craft_finalize. ' +
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

export const namingCraftFinalizeDefinition = {
  name: 'naming_craft_finalize',
  description:
    "Finalize a naming_craft in-session run by submitting the calling agent's " +
    'responses to the prompts collected by naming_craft. Returns the standard ' +
    'NamingCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the naming_craft collect call' },
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

function effectiveMode(input: NamingCraftInput): NamingCraftMode {
  if (input.mode !== undefined) return input.mode;
  // Auto: route to in-session when the configured provider is in-session
  // (the default). Otherwise inline.
  const envMode = resolveCraftLlmMode();
  return envMode === 'in-session' ? 'in-session' : 'inline';
}

export async function handleNamingCraft(
  input: NamingCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'naming_craft: `path` is required' }) },
      ],
      isError: true,
    };
  }

  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectNamingCraftPrompts(input);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
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

export async function handleNamingCraftFinalize(
  input: FinalizeNamingCraftInput
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'naming_craft_finalize: `path` is required' }),
        },
      ],
      isError: true,
    };
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'naming_craft_finalize: `runId` is required' }),
        },
      ],
      isError: true,
    };
  }
  if (!Array.isArray(input?.responses)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'naming_craft_finalize: `responses` must be an array',
          }),
        },
      ],
      isError: true,
    };
  }
  try {
    const result = await finalizeNamingCraft(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `naming_craft_finalize failed: ${message}` }),
        },
      ],
      isError: true,
    };
  }
}

export {
  runNamingCraft,
  collectNamingCraftPrompts,
  finalizeNamingCraft,
} from '../../naming-craft/index.js';
export type {
  NamingCraftInput,
  NamingCraftOutput,
  CollectPromptsOutput,
  FinalizeNamingCraftInput,
} from '../../naming-craft/index.js';
