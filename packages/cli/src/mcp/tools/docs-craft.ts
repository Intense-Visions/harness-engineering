/**
 * MCP tools for docs-craft, the documentation member of the craft-pipeline:
 *
 *   `docs_craft` — runs the skill. With `mode: 'in-session'` (the default in
 *     Claude Code) it discovers docs, builds prompts, persists run-state, and
 *     returns the prompts to the calling agent without invoking an LLM. With
 *     `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `docs_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses and returning the standard DocsCraftOutput.
 *
 * Source: docs/changes/docs-craft/proposal.md (Surface area → MCP tool)
 *   + the in-session two-step extension.
 */

import {
  runDocsCraft,
  collectDocsCraftPrompts,
  finalizeDocsCraft,
  type DocsCraftInput,
  type DocsCraftOutput,
  type DocsCraftMode,
  type CollectPromptsOutput,
  type FinalizeDocsCraftInput,
} from '../../docs-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const docsCraftDefinition = {
  name: 'docs_craft',
  description:
    'LLM-judgment critique of documentation quality — the ceiling counterpart to the rule-based ' +
    'documentation floor (detect-doc-drift / check-docs / docs-pipeline, which enforce ' +
    'existence, link freshness, and coverage). Asks the ceiling questions: does this doc teach, ' +
    'does the order match the reader’s mental model, do examples earn their place, is the prose ' +
    'alive, does the API doc predict the response shape, would a stranger walk away with the ' +
    'same understanding, can a reader find the answer fast. 7 seed rubrics; a small curated ' +
    'exemplar set (Stripe / Vercel / MDN / Linear / Tailwind) anchors the catalog. Per-file ' +
    'critique. Emits 3-axis findings (tier x impact x confidence per ADR 0019). Structural twin ' +
    'of design_craft.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (overrides docs/ discovery)',
      },
      excludeDirs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extra subdir names to skip under docs/',
      },
      maxFiles: { type: 'number', description: 'Cap doc count (default: 60)' },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call docs_craft_finalize. ' +
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

export const docsCraftFinalizeDefinition = {
  name: 'docs_craft_finalize',
  description:
    "Finalize a docs_craft in-session run by submitting the calling agent's responses to the " +
    'prompts collected by docs_craft. Returns the standard DocsCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the docs_craft collect call' },
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

function effectiveMode(input: DocsCraftInput): DocsCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleDocsCraft(
  input: DocsCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'docs_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectDocsCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: DocsCraftOutput = await runDocsCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `docs_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeDocsCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'docs_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'docs_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'docs_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleDocsCraftFinalize(
  input: FinalizeDocsCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeDocsCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `docs_craft_finalize failed: ${message}` }));
  }
}

export {
  runDocsCraft,
  collectDocsCraftPrompts,
  finalizeDocsCraft,
} from '../../docs-craft/index.js';
export type {
  DocsCraftInput,
  DocsCraftOutput,
  CollectPromptsOutput,
  FinalizeDocsCraftInput,
} from '../../docs-craft/index.js';
