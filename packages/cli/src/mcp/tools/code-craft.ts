/**
 * MCP tools for code-craft (craft-pipeline):
 *
 *   `code_craft` — runs the skill. With `mode: 'in-session'` (the default in
 *     Claude Code) it walks the project, builds prompts, persists run-state,
 *     and returns the prompts to the calling agent without invoking an LLM.
 *     With `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `code_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses, parsing them into CodeFindings, and returning
 *     the standard CodeCraftOutput.
 *
 * Source: docs/changes/code-craft/proposal.md (Surface area → MCP tool)
 *   + the in-session two-step extension.
 */

import {
  runCodeCraft,
  collectCodeCraftPrompts,
  finalizeCodeCraft,
  type CodeCraftInput,
  type CodeCraftOutput,
  type CodeCraftMode,
  type CollectPromptsOutput,
  type FinalizeCodeCraftInput,
} from '../../code-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const codeCraftDefinition = {
  name: 'code_craft',
  description:
    'LLM-judgment critique of code quality / readability — the ceiling counterpart to the ' +
    'rule-based code floor (entropy-cleaner for dead code / drift, enforce-architecture for ' +
    'boundaries + deps, complexity thresholds). Asks the ceiling questions: does the code reveal ' +
    'intent and read in the domain’s language, is the control flow honest, does the function ' +
    'tell one story at one altitude, does each abstraction earn its keep, is this as simple as ' +
    'it could be, does the signature keep its promise, would a senior nod or wince. Walks ' +
    '`packages/<pkg>/src` (falling back to `src`/`app` for single-package repos), extracts ' +
    'substantive units (functions, methods, classes) via the TS Compiler API, and critiques each ' +
    'against 7 seed rubrics; files with no substantive unit are skipped. A small curated exemplar ' +
    'set (Anthropic SDK / TanStack Query / ky / SWR / date-fns) anchors the catalog. ' +
    'Identifier-level naming is delegated to `naming_craft`. Emits 3-axis findings ' +
    '(tier x impact x confidence per ADR 0019). Structural twin of `security_craft`. ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call code_craft_finalize with the responses to get findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (overrides packages/*/src discovery)',
      },
      packages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to specific packages under packages/',
      },
      maxFiles: { type: 'number', description: 'Cap source-file count (default: 100)' },
      maxUnitsPerFile: { type: 'number', description: 'Cap per-file unit critique (default: 20)' },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call code_craft_finalize. ' +
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

export const codeCraftFinalizeDefinition = {
  name: 'code_craft_finalize',
  description:
    "Finalize a code_craft in-session run by submitting the calling agent's responses to the " +
    'prompts collected by code_craft. Returns the standard CodeCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the code_craft collect call' },
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

function effectiveMode(input: CodeCraftInput): CodeCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleCodeCraft(
  input: CodeCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'code_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectCodeCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: CodeCraftOutput = await runCodeCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `code_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeCodeCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'code_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'code_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'code_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleCodeCraftFinalize(
  input: FinalizeCodeCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeCodeCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `code_craft_finalize failed: ${message}` }));
  }
}

export {
  runCodeCraft,
  collectCodeCraftPrompts,
  finalizeCodeCraft,
} from '../../code-craft/index.js';
export type {
  CodeCraftInput,
  CodeCraftOutput,
  CollectPromptsOutput,
  FinalizeCodeCraftInput,
} from '../../code-craft/index.js';
