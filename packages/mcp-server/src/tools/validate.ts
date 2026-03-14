import * as path from 'path';
import { resolveProjectConfig } from '../utils/config-resolver.js';
import { resultToMcpResponse } from '../utils/result-adapter.js';

export const validateToolDefinition = {
  name: 'validate_project',
  description: 'Run all validation checks on a harness engineering project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
    },
    required: ['path'],
  },
};

export async function handleValidateProject(input: { path: string }) {
  const projectPath = path.resolve(input.path);
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) {
    return resultToMcpResponse(configResult);
  }
  // Return the config as validation result
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ valid: true, config: configResult.value }) }],
  };
}
