/**
 * MCP tools for cli-ergonomics-craft (craft-pipeline):
 *
 *   `cli_ergonomics_craft` — runs the skill. With `mode: 'in-session'` (the
 *     default in Claude Code) it discovers command definitions, builds prompts,
 *     persists run-state, and returns the prompts to the calling agent without
 *     invoking an LLM. With `mode: 'inline'` (or when HARNESS_CRAFT_LLM !=
 *     'in-session') it runs end-to-end against whichever provider is configured.
 *
 *   `cli_ergonomics_craft_finalize` — completes the in-session flow by consuming
 *     the calling agent's responses and returning the standard
 *     CliErgonomicsCraftOutput.
 *
 * Source: docs/changes/cli-ergonomics-craft/proposal.md (Surface area → MCP tool)
 *   + the in-session two-step extension.
 */

import {
  runCliErgonomicsCraft,
  collectCliErgonomicsCraftPrompts,
  finalizeCliErgonomicsCraft,
  type CliErgonomicsCraftInput,
  type CliErgonomicsCraftOutput,
  type CliErgonomicsCraftMode,
  type CollectPromptsOutput,
  type FinalizeCliErgonomicsCraftInput,
} from '../../cli-ergonomics-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const cliErgonomicsCraftDefinition = {
  name: 'cli_ergonomics_craft',
  description:
    'LLM-judgment critique of CLI ergonomics quality — the ceiling counterpart to mechanical CLI ' +
    'checks, and the only craft skill with no rule-based floor twin (a linter can verify a flag ' +
    'is documented, but not whether the name is predictable or the error says what to do next). ' +
    'Asks the ceiling questions: are command and flag names predictable and consistent, is help ' +
    'text task-oriented, are errors actionable, are defaults sane and safe, is output scannable ' +
    'and terminal-aware, does the CLI compose (pipeable, machine-readable, honest exit codes), ' +
    'are destructive actions guarded. 7 seed rubrics; a small curated exemplar set (gh / cargo / ' +
    'ripgrep / docker / Stripe CLI) anchors the catalog. Critiques a project’s own command ' +
    'definitions per file. Emits 3-axis findings (tier x impact x confidence per ADR 0019). ' +
    'Structural twin of docs_craft. ' +
    'In-session mode (default in Claude Code) returns prompts for the calling agent to answer; ' +
    'call cli_ergonomics_craft_finalize with the responses to get findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (overrides command discovery)',
      },
      commandsDir: {
        type: 'string',
        description: 'Directory of command definitions to critique',
      },
      excludeDirs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extra subdir names to skip while walking',
      },
      maxFiles: { type: 'number', description: 'Cap command count (default: 60)' },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call cli_ergonomics_craft_finalize. ' +
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

export const cliErgonomicsCraftFinalizeDefinition = {
  name: 'cli_ergonomics_craft_finalize',
  description:
    "Finalize a cli_ergonomics_craft in-session run by submitting the calling agent's responses " +
    'to the prompts collected by cli_ergonomics_craft. Returns the standard ' +
    'CliErgonomicsCraftOutput with findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: {
        type: 'string',
        description: 'runId returned by the cli_ergonomics_craft collect call',
      },
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

function effectiveMode(input: CliErgonomicsCraftInput): CliErgonomicsCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleCliErgonomicsCraft(
  input: CliErgonomicsCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'cli_ergonomics_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectCliErgonomicsCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: CliErgonomicsCraftOutput = await runCliErgonomicsCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `cli_ergonomics_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeCliErgonomicsCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'cli_ergonomics_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'cli_ergonomics_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'cli_ergonomics_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleCliErgonomicsCraftFinalize(
  input: FinalizeCliErgonomicsCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeCliErgonomicsCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `cli_ergonomics_craft_finalize failed: ${message}` }));
  }
}

export {
  runCliErgonomicsCraft,
  collectCliErgonomicsCraftPrompts,
  finalizeCliErgonomicsCraft,
} from '../../cli-ergonomics-craft/index.js';
export type {
  CliErgonomicsCraftInput,
  CliErgonomicsCraftOutput,
  CollectPromptsOutput,
  FinalizeCliErgonomicsCraftInput,
} from '../../cli-ergonomics-craft/index.js';
