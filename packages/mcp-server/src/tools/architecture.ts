import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveProjectConfig } from '../utils/config-resolver.js';
import { sanitizePath } from '../utils/sanitize-path.js';

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
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
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
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) return resultToMcpResponse(configResult);

  // Delegate to core library
  try {
    const { validateDependencies, TypeScriptParser } = await import('@harness-engineering/core');
    const config = configResult.value as Record<string, unknown>;
    const rawLayers = (Array.isArray(config.layers) ? config.layers : []) as Array<{
      name: string;
      pattern: string;
      allowedDependencies: string[];
    }>;
    const layers = rawLayers.map((l) => ({
      name: l.name,
      patterns: [l.pattern],
      allowedDependencies: l.allowedDependencies,
    }));
    const parser = new TypeScriptParser();

    // Attempt to load graph for enhanced validation
    const { loadGraphStore } = await import('../utils/graph-loader.js');
    const store = await loadGraphStore(projectPath);
    let graphDependencyData;
    if (store) {
      const { GraphConstraintAdapter } = await import('@harness-engineering/graph');
      const adapter = new GraphConstraintAdapter(store);
      const graphData = adapter.computeDependencyGraph();
      graphDependencyData = {
        nodes: [...graphData.nodes],
        edges: graphData.edges.map((e) => ({ ...e })),
      };
    }

    const result = await validateDependencies({
      layers,
      rootDir: projectPath,
      parser,
      graphDependencyData,
    });
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
