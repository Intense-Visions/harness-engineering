/**
 * MCP tool: `mcp__harness__security_craft`.
 *
 * Wraps security-craft (craft-pipeline #10).
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Surface area → MCP tool).
 */

import {
  runSecurityCraft,
  type SecurityCraftInput,
  type SecurityCraftOutput,
} from '../../security-craft/index.js';

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
    },
    required: ['path'],
  },
};

export async function handleSecurityCraft(input: SecurityCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'security_craft: `path` is required' }) },
      ],
      isError: true,
    };
  }
  try {
    const result: SecurityCraftOutput = await runSecurityCraft(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: `security_craft failed: ${message}` }) },
      ],
      isError: true,
    };
  }
}

export { runSecurityCraft } from '../../security-craft/index.js';
export type { SecurityCraftInput, SecurityCraftOutput } from '../../security-craft/index.js';
