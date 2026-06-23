import * as path from 'node:path';
import { sanitizePath } from '../utils/sanitize-path.js';
import type { McpToolResponse } from '../utils/result-adapter.js';

function mcpJson(payload: unknown, isError = false): McpToolResponse {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError };
}

function mcpError(message: string): McpToolResponse {
  return mcpJson({ error: message }, true);
}

export const seedPulseFromStrategyDefinition = {
  name: 'seed_pulse_from_strategy',
  description:
    'Read STRATEGY.md at the project root and extract pulse-config seed values: product `name` and `## Key metrics` bullet items. Returns `{ name, keyMetrics, warnings }`. Defensive: every failure mode degrades to a non-empty warnings array rather than throwing.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root directory' },
    },
    required: ['path'],
  },
};

export async function handleSeedPulseFromStrategy(input: {
  path: string;
}): Promise<McpToolResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const core = await import('@harness-engineering/core');
  const seed = core.seedFromStrategy({ cwd: projectPath });
  return mcpJson(seed);
}

interface WritePulseConfigInput {
  path: string;
  config: unknown;
  configPath?: string;
  skipBackup?: boolean;
}

export const writePulseConfigDefinition = {
  name: 'write_pulse_config',
  description:
    'Write a `pulse:` block into harness.config.json at the project root, preserving every other top-level key. Validates against PulseConfigSchema first; does not touch disk on schema failure. Writes harness.config.json.bak on first call only. Atomic via temp-file + rename.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root directory' },
      config: {
        type: 'object',
        description: 'PulseConfig to persist (must match PulseConfigSchema)',
      },
      configPath: {
        type: 'string',
        description:
          'Override path to harness.config.json. Defaults to <project-root>/harness.config.json. Pass an absolute path or a path relative to the project root.',
      },
      skipBackup: {
        type: 'boolean',
        description: 'When true, do not write harness.config.json.bak (default: false)',
      },
    },
    required: ['path', 'config'],
  },
};

export async function handleWritePulseConfig(
  input: WritePulseConfigInput
): Promise<McpToolResponse> {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return mcpError(error instanceof Error ? error.message : String(error));
  }
  const resolvedConfigPath =
    input.configPath !== undefined
      ? path.isAbsolute(input.configPath)
        ? input.configPath
        : path.join(projectPath, input.configPath)
      : path.join(projectPath, 'harness.config.json');

  const core = await import('@harness-engineering/core');
  try {
    core.writePulseConfig(input.config as Parameters<typeof core.writePulseConfig>[0], {
      configPath: resolvedConfigPath,
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
  return mcpJson({ written: true, configPath: resolvedConfigPath });
}
