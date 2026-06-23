import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { sanitizePath } from '../utils/sanitize-path.js';
import type { McpToolResponse } from '../utils/result-adapter.js';

const STRATEGY_FILENAME = 'STRATEGY.md';

function mcpJson(payload: unknown, isError = false): McpToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError };
}

function mcpError(message: string): McpToolResponse {
  return mcpJson({ error: message }, true);
}

export const validateStrategyDefinition = {
  name: 'validate_strategy',
  description:
    'Validate STRATEGY.md at the project root. Returns { present, valid, error? }. Soft-fails (valid: true) when absent — STRATEGY.md is an optional anchor, not a hard requirement.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root directory' },
    },
    required: ['path'],
  },
};

export async function handleValidateStrategy(input: { path: string }): Promise<McpToolResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const { validateStrategy } = await import('@harness-engineering/core');
  const result = await validateStrategy(projectPath);
  if (!result.ok) {
    return mcpJson({ present: true, valid: false, error: result.error.message });
  }
  return mcpJson({ present: result.value.present, valid: result.value.valid });
}

export const readStrategyDefinition = {
  name: 'read_strategy',
  description:
    'Read and parse STRATEGY.md at the project root. Returns { present, valid, doc?, error? } where doc is the parsed StrategyDoc when present and valid. Combines validate_strategy + parseStrategyDoc + asStrategyDoc in one call.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root directory' },
    },
    required: ['path'],
  },
};

export async function handleReadStrategy(input: { path: string }): Promise<McpToolResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const core = await import('@harness-engineering/core');
  const validation = await core.validateStrategy(projectPath);
  if (!validation.ok) {
    return mcpJson({ present: true, valid: false, error: validation.error.message });
  }
  if (!validation.value.present) {
    return mcpJson({ present: false, valid: true });
  }
  const strategyPath = path.join(projectPath, STRATEGY_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(strategyPath, 'utf-8');
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const parsed = core.parseStrategyDoc(raw);
  const doc = core.asStrategyDoc(parsed);
  if (doc === null) {
    return mcpJson({
      present: true,
      valid: false,
      error: 'STRATEGY.md frontmatter is missing required fields (name, last_updated, version)',
    });
  }
  return mcpJson({ present: true, valid: true, doc });
}

interface WriteStrategyInput {
  path: string;
  doc: unknown;
  skipBackup?: boolean;
}

export const writeStrategyDefinition = {
  name: 'write_strategy',
  description:
    'Write a StrategyDoc to STRATEGY.md at the project root. Validates against StrategyDocSchema first; does not touch disk on schema failure. Writes STRATEGY.md.bak on first overwrite (idempotent). Atomic via temp-file + rename.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root directory' },
      doc: {
        type: 'object',
        description: 'StrategyDoc to persist (must match StrategyDocSchema)',
      },
      skipBackup: {
        type: 'boolean',
        description: 'When true, do not write STRATEGY.md.bak (default: false)',
      },
    },
    required: ['path', 'doc'],
  },
};

export async function handleWriteStrategy(input: WriteStrategyInput): Promise<McpToolResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const core = await import('@harness-engineering/core');
  try {
    // writeStrategyDoc validates internally and throws on schema failure.
    core.writeStrategyDoc(input.doc as Parameters<typeof core.writeStrategyDoc>[0], {
      cwd: projectPath,
      ...(input.skipBackup !== undefined && { skipBackup: input.skipBackup }),
    });
  } catch (error) {
    return mcpJson(
      {
        written: false,
        error: error instanceof Error ? error.message : String(error),
      },
      true
    );
  }
  return mcpJson({ written: true, path: path.join(projectPath, STRATEGY_FILENAME) });
}
