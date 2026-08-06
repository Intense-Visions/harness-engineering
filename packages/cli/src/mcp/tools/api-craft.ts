/**
 * MCP tools for api-craft (craft-pipeline):
 *
 *   `api_craft` — runs the skill. With `mode: 'in-session'` (the default in
 *     Claude Code) it discovers API surfaces, builds prompts, persists
 *     run-state, and returns the prompts to the calling agent without invoking
 *     an LLM. With `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session')
 *     it runs end-to-end against whichever provider is configured.
 *
 *   `api_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses and returning the standard ApiCraftOutput.
 */

import {
  runApiCraft,
  collectApiCraftPrompts,
  finalizeApiCraft,
  type ApiCraftInput,
  type ApiCraftOutput,
  type ApiCraftMode,
  type CollectPromptsOutput,
  type FinalizeApiCraftInput,
} from '../../api-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const apiCraftDefinition = {
  name: 'api_craft',
  description:
    'LLM-judgment critique of API quality — the ceiling counterpart to rule-based API checks ' +
    '(OpenAPI-format and webhook-format compliance). Asks the ceiling questions a linter cannot: ' +
    'do resources model the domain rather than the implementation, is the resource naming and ' +
    'URL structure predictable (path vs query param), are HTTP methods honest, are status codes ' +
    'correct, do error responses tell the consumer what to do, are response shapes predictable ' +
    'and consistent, do collections paginate and filter consistently, are mutations ' +
    'idempotency-honest, and does the API evolve without breaking consumers. Discovers a ' +
    'project’s own API surface — OpenAPI/Swagger documents and route/handler definitions — and ' +
    'critiques each per file. 9 seed rubrics; a curated exemplar set (Stripe / Linear / GitHub / ' +
    'Resend / Anthropic) anchors the catalog. Emits 3-axis findings (tier x impact x confidence ' +
    'per ADR 0019). Structural twin of cli_ergonomics_craft. ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call api_craft_finalize with the responses to get findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (overrides API-surface discovery)',
      },
      routesDir: {
        type: 'string',
        description: 'Directory of route/handler definitions to critique',
      },
      specFile: {
        type: 'string',
        description: 'Explicit OpenAPI/Swagger document to critique',
      },
      excludeDirs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extra subdir names to skip while walking',
      },
      maxFiles: { type: 'number', description: 'Cap surface count (default: 60)' },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call api_craft_finalize. ' +
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

export const apiCraftFinalizeDefinition = {
  name: 'api_craft_finalize',
  description:
    "Finalize an api_craft in-session run by submitting the calling agent's responses to the " +
    'prompts collected by api_craft. Returns the standard ApiCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the api_craft collect call' },
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

function effectiveMode(input: ApiCraftInput): ApiCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleApiCraft(
  input: ApiCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'api_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectApiCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: ApiCraftOutput = await runApiCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `api_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeApiCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'api_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'api_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'api_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleApiCraftFinalize(input: FinalizeApiCraftInput): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeApiCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `api_craft_finalize failed: ${message}` }));
  }
}

export { runApiCraft, collectApiCraftPrompts, finalizeApiCraft } from '../../api-craft/index.js';
export type {
  ApiCraftInput,
  ApiCraftOutput,
  CollectPromptsOutput,
  FinalizeApiCraftInput,
} from '../../api-craft/index.js';
