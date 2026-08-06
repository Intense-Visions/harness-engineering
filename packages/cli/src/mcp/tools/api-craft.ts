/**
 * MCP tool: `mcp__harness__api_craft`.
 *
 * Wraps api-craft, the API-quality member of the craft-pipeline initiative.
 */

import { runApiCraft, type ApiCraftInput, type ApiCraftOutput } from '../../api-craft/index.js';

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
    'per ADR 0019). Structural twin of cli_ergonomics_craft.',
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
    },
    required: ['path'],
  },
};

function ok(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

function fail(text: string): ToolResponse {
  return { content: [{ type: 'text', text }], isError: true };
}

export async function handleApiCraft(input: ApiCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'api_craft: `path` is required' }));
  }
  try {
    const result: ApiCraftOutput = await runApiCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `api_craft failed: ${message}` }));
  }
}

export { runApiCraft } from '../../api-craft/index.js';
export type { ApiCraftInput, ApiCraftOutput } from '../../api-craft/index.js';
