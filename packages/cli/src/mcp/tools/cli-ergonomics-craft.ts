/**
 * MCP tool: `mcp__harness__cli_ergonomics_craft`.
 *
 * Wraps cli-ergonomics-craft, the command-line-quality member of the
 * craft-pipeline initiative.
 *
 * Source: docs/changes/cli-ergonomics-craft/proposal.md (Surface area → MCP tool).
 */

import {
  runCliErgonomicsCraft,
  type CliErgonomicsCraftInput,
  type CliErgonomicsCraftOutput,
} from '../../cli-ergonomics-craft/index.js';

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
    'Structural twin of docs_craft.',
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

export async function handleCliErgonomicsCraft(
  input: CliErgonomicsCraftInput
): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return fail(JSON.stringify({ error: 'cli_ergonomics_craft: `path` is required' }));
  }
  try {
    const result: CliErgonomicsCraftOutput = await runCliErgonomicsCraft(input);
    return ok(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(JSON.stringify({ error: `cli_ergonomics_craft failed: ${message}` }));
  }
}

export { runCliErgonomicsCraft } from '../../cli-ergonomics-craft/index.js';
export type {
  CliErgonomicsCraftInput,
  CliErgonomicsCraftOutput,
} from '../../cli-ergonomics-craft/index.js';
