import { Ok, Err } from '@harness-engineering/core';
import { generateSlashCommands } from '@harness-engineering/cli';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import type { McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const generateSlashCommandsDefinition = {
  name: 'generate_slash_commands',
  description:
    'Generate native slash commands for Claude Code and Gemini CLI from harness skill metadata',
  inputSchema: {
    type: 'object' as const,
    properties: {
      platforms: {
        type: 'string',
        description: 'Comma-separated platforms: claude-code,gemini-cli (default: both)',
      },
      global: {
        type: 'boolean',
        description:
          'Write to global config directories (~/.claude/commands/, ~/.gemini/commands/)',
      },
      output: {
        type: 'string',
        description: 'Custom output directory',
      },
      skillsDir: {
        type: 'string',
        description: 'Skills directory to scan',
      },
      includeGlobal: {
        type: 'boolean',
        description: 'Include built-in global skills alongside project skills',
      },
      dryRun: {
        type: 'boolean',
        description: 'Show what would change without writing files',
      },
    },
  },
};

export async function handleGenerateSlashCommands(input: {
  platforms?: string;
  global?: boolean;
  includeGlobal?: boolean;
  output?: string;
  skillsDir?: string;
  dryRun?: boolean;
}): Promise<McpToolResponse> {
  try {
    const platforms = (input.platforms ?? 'claude-code,gemini-cli')
      .split(',')
      .map((p) => p.trim()) as Array<'claude-code' | 'gemini-cli'>;

    const results = generateSlashCommands({
      platforms,
      global: input.global ?? false,
      includeGlobal: input.includeGlobal ?? false,
      output: input.output ? sanitizePath(input.output) : undefined,
      skillsDir: input.skillsDir ? sanitizePath(input.skillsDir) : '',
      dryRun: input.dryRun ?? false,
      yes: true,
    });

    return resultToMcpResponse(Ok(JSON.stringify(results, null, 2)));
  } catch (error) {
    return resultToMcpResponse(Err(error instanceof Error ? error : new Error(String(error))));
  }
}
