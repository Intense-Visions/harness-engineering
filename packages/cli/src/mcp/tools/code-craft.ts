/**
 * MCP tool: `mcp__harness__code_craft`.
 *
 * Wraps code-craft, the code-quality member of the craft-pipeline initiative.
 *
 * Source: docs/changes/code-craft/proposal.md (Surface area → MCP tool).
 */

import { runCodeCraft, type CodeCraftInput, type CodeCraftOutput } from '../../code-craft/index.js';

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
    '`packages/<pkg>/src`, extracts substantive units (functions, methods, classes) via the TS ' +
    'Compiler API, and critiques each against 7 seed rubrics; files with no substantive unit are ' +
    'skipped. A small curated exemplar set (Anthropic SDK / TanStack Query / ky / SWR / date-fns) ' +
    'anchors the catalog. Identifier-level naming is delegated to `naming_craft`. Emits 3-axis ' +
    'findings (tier x impact x confidence per ADR 0019). Structural twin of `security_craft`.',
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

export async function handleCodeCraft(input: CodeCraftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'code_craft: `path` is required' }));
  }
  try {
    const result: CodeCraftOutput = await runCodeCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `code_craft failed: ${message}` }));
  }
}

export { runCodeCraft } from '../../code-craft/index.js';
export type { CodeCraftInput, CodeCraftOutput } from '../../code-craft/index.js';
