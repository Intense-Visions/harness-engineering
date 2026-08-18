/**
 * MCP tools for security-craft (craft-pipeline #10):
 *
 *   `security_craft` — runs the skill. With `mode: 'in-session'` (the default
 *     in Claude Code) it detects signals, builds prompts, persists run-state,
 *     and returns the prompts to the calling agent without invoking an LLM.
 *     With `mode: 'inline'` (or when HARNESS_CRAFT_LLM != 'in-session') it runs
 *     end-to-end against whichever provider is configured.
 *
 *   `security_craft_finalize` — completes the in-session flow by consuming the
 *     calling agent's responses and returning the standard SecurityCraftOutput.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   + the in-session two-step extension.
 */

import {
  runSecurityCraft,
  collectSecurityCraftPrompts,
  finalizeSecurityCraft,
  type SecurityCraftInput,
  type SecurityCraftOutput,
  type SecurityCraftMode,
  type CollectPromptsOutput,
  type FinalizeSecurityCraftInput,
} from '../../security-craft/index.js';
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const securityCraftDefinition = {
  name: 'security_craft',
  description:
    'LLM-judgment critique of security posture (TS/JS source). Sixth non-design ' +
    'craft-pipeline ceiling skill; the final sub-project (#10 of 10). 8 seed rubrics: ' +
    'trust-boundary-respected, least-authority-honored, defense-in-depth, ' +
    'assumed-adversary-realistic, data-flow-annotated, fail-closed-not-open, ' +
    'secret-handling-shape, authz-before-action. AST-driven signal detection (only ' +
    'files with security-relevant constructs are critiqued — http handlers, middleware, ' +
    'auth APIs, child_process/eval, fs writes, raw queries, network egress, secret ' +
    'handling). Conservative confidence defaults manage the FP risk inherent in ' +
    'judgment-based security. Emits 3-axis findings (tier x impact x confidence per ADR 0019).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scope (overrides discovery)',
      },
      packages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Restrict to specific packages under packages/',
      },
      maxFiles: { type: 'number', description: 'Cap source-file count (default: 100)' },
      maxSignalsPerFile: {
        type: 'number',
        description: 'Cap per-file signal critique (default: 10)',
      },
      mode: {
        type: 'string',
        enum: ['inline', 'in-session'],
        description:
          "'in-session' (default): return prompts for the calling agent to answer, " +
          'then call security_craft_finalize. ' +
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

export const securityCraftFinalizeDefinition = {
  name: 'security_craft_finalize',
  description:
    "Finalize a security_craft in-session run by submitting the calling agent's responses to " +
    'the prompts collected by security_craft. Returns the standard SecurityCraftOutput with ' +
    'findings.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path used in the collect call (must match)',
      },
      runId: { type: 'string', description: 'runId returned by the security_craft collect call' },
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

function effectiveMode(input: SecurityCraftInput): SecurityCraftMode {
  if (input.mode !== undefined) return input.mode;
  return resolveCraftLlmMode() === 'in-session' ? 'in-session' : 'inline';
}

export async function handleSecurityCraft(
  input: SecurityCraftInput & { promptBudget?: number }
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'security_craft: `path` is required' }));
  }
  try {
    if (effectiveMode(input) === 'in-session') {
      const result: CollectPromptsOutput = await collectSecurityCraftPrompts(input);
      return ok(JSON.stringify(result, null, 2));
    }
    const result: SecurityCraftOutput = await runSecurityCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `security_craft failed: ${message}` }));
  }
}

/** Validate finalize input; returns an error message or null when valid. */
function finalizeInputError(input: FinalizeSecurityCraftInput): string | null {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return 'security_craft_finalize: `path` is required';
  }
  if (typeof input?.runId !== 'string' || input.runId.length === 0) {
    return 'security_craft_finalize: `runId` is required';
  }
  if (!Array.isArray(input?.responses)) {
    return 'security_craft_finalize: `responses` must be an array';
  }
  return null;
}

export async function handleSecurityCraftFinalize(
  input: FinalizeSecurityCraftInput
): Promise<ToolResponse> {
  const validationError = finalizeInputError(input);
  if (validationError !== null) return fail(JSON.stringify({ error: validationError }));
  try {
    const result = await finalizeSecurityCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `security_craft_finalize failed: ${message}` }));
  }
}

export {
  runSecurityCraft,
  collectSecurityCraftPrompts,
  finalizeSecurityCraft,
} from '../../security-craft/index.js';
export type {
  SecurityCraftInput,
  SecurityCraftOutput,
  CollectPromptsOutput,
  FinalizeSecurityCraftInput,
} from '../../security-craft/index.js';
