import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';

export const generateAgentDefinitionsDefinition = {
  name: 'generate_agent_definitions',
  description: 'Generate agent definition files from personas for Claude Code and Gemini CLI',
  inputSchema: {
    type: 'object' as const,
    properties: {
      global: { type: 'boolean', description: 'Write to global agent directory' },
      platform: {
        type: 'string',
        enum: ['claude-code', 'gemini-cli', 'all'],
        description: 'Target platform (default: all)',
      },
      dryRun: { type: 'boolean', description: 'Preview without writing' },
    },
  },
};

export async function handleGenerateAgentDefinitions(input: {
  global?: boolean;
  platform?: string;
  dryRun?: boolean;
}) {
  const { generateAgentDefinitions } = await import('@harness-engineering/cli');
  const platforms =
    input.platform === 'all' || !input.platform
      ? (['claude-code', 'gemini-cli'] as const)
      : ([input.platform] as const);
  const results = generateAgentDefinitions({
    platforms: [...platforms] as ('claude-code' | 'gemini-cli')[],
    global: input.global ?? false,
    dryRun: input.dryRun ?? false,
  });
  return resultToMcpResponse(Ok(results));
}
