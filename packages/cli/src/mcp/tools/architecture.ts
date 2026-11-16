import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveProjectConfig } from '../utils/config-resolver.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { unparsedFileChecks } from '../../commands/check-deps.js';

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
    const { validateDependencies, TypeScriptParser, resolveDepsSettings, toLayerConfig } =
      await import('@harness-engineering/core');
    // The same config-to-LayerConfig mapping `harness check-deps` and the
    // `harness ci check` deps step use, so all three honour `deps.exclude`,
    // `deps.fallbackBehavior` (default `skip`, #2098),
    // `deps.resolveWorkspacePackages` (#2216) and `rootDir` alike (#2606).
    const settings = resolveDepsSettings(configResult.value, projectPath);
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
      ...toLayerConfig(settings, parser),
      // Inert for workspace resolution when graph data is supplied.
      ...(graphDependencyData !== undefined && { graphDependencyData }),
    });

    // The engine abstained: it validated nothing and labelled the result as
    // such (#2098). Returning it as an ordinary success would hand the caller a
    // payload byte-identical to a clean project — `valid: true`, zero
    // violations — for a check that never ran. Say so instead.
    if (result.ok && result.value.skipped) {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `check_dependencies validated nothing: ${result.value.reason ?? 'the analysis engine abstained'}. ` +
              'No layer boundary was checked — this is not a clean result.',
          },
        ],
        isError: true,
      };
    }

    // Run design constraint checks when design tokens exist in the graph
    let designViolations: Array<{
      code: string;
      file: string;
      message: string;
      severity: string;
    }> = [];
    if (store) {
      const designTokenNodes = store.findNodes({ type: 'design_token' as never });
      if (designTokenNodes.length > 0) {
        const { DesignConstraintAdapter } = await import('@harness-engineering/graph');
        const designAdapter = new DesignConstraintAdapter(store);
        const fileNodes = store.findNodes({ type: 'file' });
        for (const fileNode of fileNodes) {
          const filePath = fileNode.path ?? fileNode.id;
          if (!/\.(tsx?|jsx?|css|scss|less|vue|svelte)$/.test(filePath)) continue;
          const source =
            typeof fileNode.metadata?.source === 'string' ? fileNode.metadata.source : '';
          if (!source) continue;
          designViolations.push(...designAdapter.checkAll(source, filePath));
        }
      }
    }

    if (!result.ok) return resultToMcpResponse(result);

    // Files the engine could not parse (#2073), named the way `check-deps`
    // names them. Additive: `valid` keeps speaking only to violations, so a
    // consumer deciding on a clean verdict must also read `unavailableChecks`
    // unless `abstentionDowngraded` (`deps.fallbackBehavior: 'warn'`) is set.
    const unavailableChecks = unparsedFileChecks(
      result.value.unparsedFiles ?? [],
      settings.rootDir
    );

    return resultToMcpResponse({
      ok: true,
      value: {
        ...result.value,
        ...(designViolations.length > 0 ? { designViolations } : {}),
        ...(unavailableChecks.length > 0 ? { unavailableChecks } : {}),
        ...(unavailableChecks.length > 0 && settings.fallbackBehavior === 'warn'
          ? { abstentionDowngraded: true }
          : {}),
      },
    });
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
