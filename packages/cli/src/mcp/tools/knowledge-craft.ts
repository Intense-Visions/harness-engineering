/**
 * MCP tools for knowledge-craft (craft-pipeline #9):
 *
 *   `knowledge_craft` — runs the skill. With `mode: 'in-session'` (the default
 *     in Claude Code) it discovers entries, builds prompts, persists run-state,
 *     and returns the prompts to the calling agent without invoking an LLM.
 *     With `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `knowledge_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses and returning the standard KnowledgeCraftOutput.
 *
 * Source: docs/changes/craft-pipeline/knowledge-craft/proposal.md
 *   + the in-session two-step extension.
 */

import {
  runKnowledgeCraft,
  collectKnowledgeCraftPrompts,
  finalizeKnowledgeCraft,
  type KnowledgeCraftInput,
  type KnowledgeCraftOutput,
  type KnowledgeCraftMode,
  type CollectPromptsOutput,
  type FinalizeKnowledgeCraftInput,
} from '../../knowledge-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const knowledgeCraftDefinition = {
  name: 'knowledge_craft',
  description:
    'LLM-judgment critique of knowledge-entry quality (docs/knowledge/, excluding ' +
    'decisions/ — that is spec-craft territory). Fifth non-design craft-pipeline ceiling ' +
    'skill; 7 seed rubrics (load-bearing-fact, earns-graph-place, carries-forward-decision, …). ' +
    'Per-file critique. References graph taxonomy (business_fact / business_rule / ' +
    'business_concept / business_decision) inside rubrics without reading the graph. ' +
    'Emits 3-axis findings (tier x impact x confidence per ADR 0019). ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call knowledge_craft_finalize with the responses to get findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (overrides docs/knowledge/ discovery)',
      },
      excludeDirs: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Extra subdir names to skip under docs/knowledge/ (decisions is always excluded)',
      },
      maxFiles: { type: 'number', description: 'Cap entry count (default: 50)' },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call knowledge_craft_finalize. ' +
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

export const knowledgeCraftFinalizeDefinition = {
  name: 'knowledge_craft_finalize',
  description:
    "Finalize a knowledge_craft in-session run by submitting the calling agent's responses to " +
    'the prompts collected by knowledge_craft. Returns the standard KnowledgeCraftOutput with ' +
    'findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the knowledge_craft collect call' },
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

function effectiveMode(input: KnowledgeCraftInput): KnowledgeCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleKnowledgeCraft(
  input: KnowledgeCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'knowledge_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectKnowledgeCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: KnowledgeCraftOutput = await runKnowledgeCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `knowledge_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeKnowledgeCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'knowledge_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'knowledge_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'knowledge_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleKnowledgeCraftFinalize(
  input: FinalizeKnowledgeCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeKnowledgeCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `knowledge_craft_finalize failed: ${message}` }));
  }
}

export {
  runKnowledgeCraft,
  collectKnowledgeCraftPrompts,
  finalizeKnowledgeCraft,
} from '../../knowledge-craft/index.js';
export type {
  KnowledgeCraftInput,
  KnowledgeCraftOutput,
  CollectPromptsOutput,
  FinalizeKnowledgeCraftInput,
} from '../../knowledge-craft/index.js';
