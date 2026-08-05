/**
 * MCP tool: `mcp__harness__docs_craft`.
 *
 * Wraps docs-craft, the documentation member of the craft-pipeline initiative.
 *
 * Source: docs/changes/docs-craft/proposal.md (Surface area → MCP tool).
 */

import { runDocsCraft, type DocsCraftInput, type DocsCraftOutput } from '../../docs-craft/index.js';

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

export async function handleDocsCraft(input: DocsCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'docs_craft: `path` is required' }));
  }
  try {
    const result: DocsCraftOutput = await runDocsCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `docs_craft failed: ${message}` }));
  }
}

export { runDocsCraft } from '../../docs-craft/index.js';
export type { DocsCraftInput, DocsCraftOutput } from '../../docs-craft/index.js';
