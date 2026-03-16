import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveProjectConfig } from '../utils/config-resolver.js';

export const checkDependenciesDefinition = {
  name: 'check_dependencies',
  description: 'Validate layer boundaries and detect circular dependencies',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleCheckDependencies(input: { path: string }) {
  const projectPath = path.resolve(input.path);
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) return resultToMcpResponse(configResult);

  // Delegate to core library
  try {
    const { validateDependencies, TypeScriptParser } = await import('@harness-engineering/core');
    const config = configResult.value;
    const rawLayers = (config as any).layers ?? [];
    const layers = rawLayers.map((l: any) => ({
      name: l.name,
      patterns: [l.pattern],
      allowedDependencies: l.allowedDependencies,
    }));
    const parser = new TypeScriptParser();
    const result = await validateDependencies({ layers, rootDir: projectPath, parser });
    return resultToMcpResponse(result);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
