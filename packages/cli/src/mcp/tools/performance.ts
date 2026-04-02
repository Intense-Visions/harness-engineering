import { Ok } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { findConfigFile, loadConfig } from '../../config/loader.js';

export const checkPerformanceDefinition = {
  name: 'check_performance',
  description: 'Run performance checks: structural complexity, coupling metrics, and size budgets',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['structural', 'coupling', 'size', 'all'],
        description: 'Type of performance check (default: all)',
      },
    },
    required: ['path'],
  },
};

export async function handleCheckPerformance(input: { path: string; type?: string }) {
  try {
    const { EntropyAnalyzer } = await import('@harness-engineering/core');
    const typeFilter = input.type ?? 'all';

    const projectPath = sanitizePath(input.path);

    // Read entryPoints from harness.config.json if available
    let entryPoints: string[] | undefined;
    const configFileResult = findConfigFile(projectPath);
    if (configFileResult.ok) {
      const configResult = loadConfig(configFileResult.value);
      if (configResult.ok) {
        const perfConfig = configResult.value.performance as { entryPoints?: string[] } | undefined;
        entryPoints = perfConfig?.entryPoints;
      }
    }

    const analyzer = new EntropyAnalyzer({
      rootDir: projectPath,
      ...(entryPoints ? { entryPoints } : {}),
      analyze: {
        complexity: typeFilter === 'all' || typeFilter === 'structural',
        coupling: typeFilter === 'all' || typeFilter === 'coupling',
        sizeBudget: typeFilter === 'all' || typeFilter === 'size',
      },
    });

    // Load graph data if available
    let graphOptions: Record<string, unknown> | undefined;
    try {
      const { loadGraphStore } = await import('../utils/graph-loader.js');
      const store = await loadGraphStore(projectPath);
      if (store) {
        const { GraphComplexityAdapter, GraphCouplingAdapter } =
          await import('@harness-engineering/graph');
        const complexityAdapter = new GraphComplexityAdapter(store);
        const couplingAdapter = new GraphCouplingAdapter(store);
        graphOptions = {
          graphComplexityData: complexityAdapter.computeComplexityHotspots(),
          graphCouplingData: couplingAdapter.computeCouplingData(),
        };
      }
    } catch {
      // Graph not available — proceed without
    }

    const result = await analyzer.analyze(graphOptions);
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

// --- get_perf_baselines ---

export const getPerfBaselinesDefinition = {
  name: 'get_perf_baselines',
  description: 'Read current performance baselines from .harness/perf/baselines.json',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleGetPerfBaselines(input: { path: string }) {
  try {
    const { BaselineManager } = await import('@harness-engineering/core');
    const manager = new BaselineManager(sanitizePath(input.path));
    const baselines = manager.load();
    return resultToMcpResponse(
      Ok(baselines ?? { version: 1, updatedAt: '', updatedFrom: '', benchmarks: {} })
    );
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

// --- update_perf_baselines ---

export const updatePerfBaselinesDefinition = {
  name: 'update_perf_baselines',
  description: 'Update performance baselines from benchmark results. Run benchmarks first via CLI.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      commitHash: { type: 'string', description: 'Current commit hash for baseline tracking' },
      results: {
        type: 'array',
        description: 'Array of benchmark results to save as baselines',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            file: { type: 'string' },
            opsPerSec: { type: 'number' },
            meanMs: { type: 'number' },
            p99Ms: { type: 'number' },
            marginOfError: { type: 'number' },
          },
          required: ['name', 'file', 'opsPerSec', 'meanMs', 'p99Ms', 'marginOfError'],
        },
      },
    },
    required: ['path', 'commitHash', 'results'],
  },
};

export async function handleUpdatePerfBaselines(input: {
  path: string;
  commitHash: string;
  results: Array<{
    name: string;
    file: string;
    opsPerSec: number;
    meanMs: number;
    p99Ms: number;
    marginOfError: number;
  }>;
}) {
  try {
    const { BaselineManager } = await import('@harness-engineering/core');
    const manager = new BaselineManager(sanitizePath(input.path));
    manager.save(input.results, input.commitHash);
    const updated = manager.load();
    return resultToMcpResponse(Ok(updated));
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

// --- get_critical_paths ---

export const getCriticalPathsDefinition = {
  name: 'get_critical_paths',
  description:
    'List performance-critical functions from @perf-critical annotations and graph inference',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleGetCriticalPaths(input: { path: string }) {
  try {
    const { CriticalPathResolver } = await import('@harness-engineering/core');
    const resolver = new CriticalPathResolver(sanitizePath(input.path));
    const result = await resolver.resolve();
    return resultToMcpResponse(Ok(result));
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
