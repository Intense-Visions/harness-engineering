import { Command } from 'commander';
import * as path from 'path';
import type { IngestResult } from '@harness-engineering/graph';

async function loadConnectorConfig(
  projectPath: string,
  source: string
): Promise<Record<string, unknown>> {
  try {
    const fs = await import('node:fs/promises');
    const configPath = path.join(projectPath, 'harness.config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const connector = config.graph?.connectors?.find(
      (c: { source: string }) => c.source === source
    );
    return connector?.config ?? {};
  } catch {
    return {};
  }
}

function mergeResults(...results: IngestResult[]): IngestResult {
  return results.reduce(
    (acc, r) => ({
      nodesAdded: acc.nodesAdded + r.nodesAdded,
      nodesUpdated: acc.nodesUpdated + r.nodesUpdated,
      edgesAdded: acc.edgesAdded + r.edgesAdded,
      edgesUpdated: acc.edgesUpdated + r.edgesUpdated,
      errors: [...acc.errors, ...r.errors],
      durationMs: acc.durationMs + r.durationMs,
    }),
    {
      nodesAdded: 0,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [] as string[],
      durationMs: 0,
    }
  );
}

export async function runIngest(
  projectPath: string,
  source: string,
  opts?: { full?: boolean; all?: boolean }
): Promise<IngestResult> {
  const {
    GraphStore,
    CodeIngestor,
    TopologicalLinker,
    KnowledgeIngestor,
    GitIngestor,
    SyncManager,
    JiraConnector,
    SlackConnector,
  } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectPath, '.harness', 'graph');
  const store = new GraphStore();
  await store.load(graphDir);

  if (opts?.all) {
    const startMs = Date.now();
    const codeResult = await new CodeIngestor(store).ingest(projectPath);
    new TopologicalLinker(store).link();
    const knowledgeResult = await new KnowledgeIngestor(store).ingestAll(projectPath);
    const gitResult = await new GitIngestor(store).ingest(projectPath);

    // Also run configured external connectors via SyncManager
    const syncManager = new SyncManager(store, graphDir);
    const connectorMap: Record<
      string,
      () => InstanceType<typeof JiraConnector> | InstanceType<typeof SlackConnector>
    > = {
      jira: () => new JiraConnector(),
      slack: () => new SlackConnector(),
    };
    // Load connector configs and register
    for (const [name, factory] of Object.entries(connectorMap)) {
      const config = await loadConnectorConfig(projectPath, name);
      syncManager.registerConnector(factory(), config);
    }
    const connectorResult = await syncManager.syncAll();

    await store.save(graphDir);
    const merged = mergeResults(codeResult, knowledgeResult, gitResult, connectorResult);
    return { ...merged, durationMs: Date.now() - startMs };
  }

  let result: IngestResult;
  switch (source) {
    case 'code':
      result = await new CodeIngestor(store).ingest(projectPath);
      new TopologicalLinker(store).link();
      break;
    case 'knowledge':
      result = await new KnowledgeIngestor(store).ingestAll(projectPath);
      break;
    case 'git':
      result = await new GitIngestor(store).ingest(projectPath);
      break;
    default: {
      // Check if source is a known external connector before trying to instantiate
      const knownConnectors = ['jira', 'slack'];
      if (!knownConnectors.includes(source)) {
        throw new Error(`Unknown source: ${source}. Available: code, knowledge, git, jira, slack`);
      }
      if (!SyncManager) {
        throw new Error(
          `Connector support not available. Ensure @harness-engineering/graph is built with connector support.`
        );
      }
      // Try to find as external connector
      const syncManager = new SyncManager(store, graphDir);
      const extConnectorMap: Record<
        string,
        () => InstanceType<typeof JiraConnector> | InstanceType<typeof SlackConnector>
      > = {
        jira: () => new JiraConnector(),
        slack: () => new SlackConnector(),
      };
      const factory = extConnectorMap[source]!;
      const config = await loadConnectorConfig(projectPath, source);
      syncManager.registerConnector(factory(), config);
      result = await syncManager.sync(source);
      break;
    }
  }

  await store.save(graphDir);
  return result;
}

export function createIngestCommand(): Command {
  return new Command('ingest')
    .description('Ingest data into the knowledge graph')
    .option('--source <name>', 'Source to ingest (code, knowledge, git, jira, slack)')
    .option('--all', 'Run all sources (code, knowledge, git, and configured connectors)')
    .option('--full', 'Force full re-ingestion')
    .action(async (opts, cmd) => {
      if (!opts.source && !opts.all) {
        console.error('Error: --source or --all is required');
        process.exit(1);
      }
      const globalOpts = cmd.optsWithGlobals();
      const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
      try {
        const result = await runIngest(projectPath, opts.source ?? '', {
          full: opts.full,
          all: opts.all,
        });
        if (globalOpts.json) {
          console.log(JSON.stringify(result));
        } else {
          const label = opts.all ? 'all' : opts.source;
          console.log(
            `Ingested (${label}): +${result.nodesAdded} nodes, +${result.edgesAdded} edges (${result.durationMs}ms)`
          );
        }
      } catch (err) {
        console.error('Ingest failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });
}
