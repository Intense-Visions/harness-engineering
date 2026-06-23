import { Command } from 'commander';
import * as path from 'path';
import type { IngestResult, GraphConnector } from '@harness-engineering/graph';
import { loadIngestOptions } from './ingest-options.js';

async function loadConnectorConfig(
  projectPath: string,
  source: string
): Promise<Record<string, unknown>> {
  try {
    const fs = await import('node:fs/promises');
    const configPath = path.join(projectPath, 'harness.config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const connector = config.graph?.connectors?.[source];
    return connector ?? {};
  } catch {
    return {};
  }
}

/**
 * Run the three BusinessKnowledge ingestion methods against the canonical
 * project paths (docs/knowledge, docs/solutions, STRATEGY.md) and merge the
 * results. Shared between the `--source knowledge` branch and the `--all`
 * path so both produce the same node coverage. Takes an already-constructed
 * ingestor so the caller imports `BusinessKnowledgeIngestor` once via the
 * top-level dynamic import bundle.
 */
async function ingestBusinessKnowledge(
  bk: {
    ingest: (dir: string) => Promise<IngestResult>;
    ingestSolutions: (dir: string) => Promise<IngestResult>;
    ingestStrategy: (file: string) => Promise<IngestResult>;
  },
  projectPath: string
): Promise<IngestResult> {
  return mergeResults(
    await bk.ingest(path.join(projectPath, 'docs', 'knowledge')),
    await bk.ingestSolutions(path.join(projectPath, 'docs', 'solutions')),
    await bk.ingestStrategy(path.join(projectPath, 'STRATEGY.md'))
  );
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
    BusinessKnowledgeIngestor,
    GitIngestor,
    RequirementIngestor,
    SyncManager,
    JiraConnector,
    SlackConnector,
    CIConnector,
    ConfluenceConnector,
    FigmaConnector,
    MiroConnector,
  } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectPath, '.harness', 'graph');
  const store = new GraphStore();
  await store.load(graphDir);
  const ingestOptions = loadIngestOptions(projectPath);

  if (opts?.all) {
    const startMs = Date.now();
    const codeResult = await new CodeIngestor(store, ingestOptions).ingest(projectPath);
    new TopologicalLinker(store).link();
    const knowledgeResult = await new KnowledgeIngestor(store).ingestAll(projectPath);
    // Follow-up from PR #511: --all now exercises BK paths too.
    const bkInst = new BusinessKnowledgeIngestor(store);
    const bkResult = await ingestBusinessKnowledge(bkInst, projectPath);
    const reqResult = await new RequirementIngestor(store).ingestSpecs(
      path.join(projectPath, 'docs', 'changes')
    );
    const gitResult = await new GitIngestor(store).ingest(projectPath);
    const { createExtractionRunner } = await import('@harness-engineering/graph');
    const extractedDir = path.join(projectPath, '.harness', 'knowledge', 'extracted');
    const signalsResult = await createExtractionRunner().run(projectPath, store, extractedDir);

    const syncManager = new SyncManager(store, graphDir);
    const connectorMap: Record<string, () => GraphConnector> = {
      jira: () => new JiraConnector(),
      slack: () => new SlackConnector(),
      ci: () => new CIConnector(),
      confluence: () => new ConfluenceConnector(),
      figma: () => new FigmaConnector(),
      miro: () => new MiroConnector(),
    };
    for (const [name, factory] of Object.entries(connectorMap)) {
      const config = await loadConnectorConfig(projectPath, name);
      syncManager.registerConnector(factory(), config);
    }
    const connectorResult = await syncManager.syncAll();

    await store.save(graphDir);
    const merged = mergeResults(
      codeResult,
      knowledgeResult,
      bkResult,
      reqResult,
      gitResult,
      signalsResult,
      connectorResult
    );
    return { ...merged, durationMs: Date.now() - startMs };
  }

  let result: IngestResult;
  switch (source) {
    case 'code':
      result = await new CodeIngestor(store, ingestOptions).ingest(projectPath);
      new TopologicalLinker(store).link();
      break;
    case 'knowledge': {
      // Run KnowledgeIngestor (ADRs, learnings, failures, general docs) AND
      // BusinessKnowledgeIngestor (docs/knowledge, docs/solutions, STRATEGY.md).
      // Previously --source knowledge only ran the former, leaving the latter
      // substrate unreachable except via `harness knowledge-pipeline` — which
      // surfaced as a silent `+0 nodes` for users who probed via this command.
      // See github issue #504 Finding 1.
      const knowledge = await new KnowledgeIngestor(store).ingestAll(projectPath);
      const bk = await ingestBusinessKnowledge(new BusinessKnowledgeIngestor(store), projectPath);
      result = mergeResults(knowledge, bk);
      break;
    }
    case 'git':
      result = await new GitIngestor(store).ingest(projectPath);
      break;
    case 'requirements':
      result = await new RequirementIngestor(store).ingestSpecs(
        path.join(projectPath, 'docs', 'changes')
      );
      break;
    case 'business-signals': {
      const { createExtractionRunner } = await import('@harness-engineering/graph');
      const extractedDir = path.join(projectPath, '.harness', 'knowledge', 'extracted');
      result = await createExtractionRunner().run(projectPath, store, extractedDir);
      break;
    }
    default: {
      // Check if source is a known external connector before trying to instantiate
      const knownConnectors = ['jira', 'slack', 'ci', 'confluence', 'figma', 'miro'];
      if (!knownConnectors.includes(source)) {
        throw new Error(
          `Unknown source: ${source}. Available: code, knowledge, git, requirements, business-signals, jira, slack, ci, confluence, figma, miro`
        );
      }
      if (!SyncManager) {
        throw new Error(
          `Connector support not available. Ensure @harness-engineering/graph is built with connector support.`
        );
      }
      // Try to find as external connector
      const syncManager = new SyncManager(store, graphDir);
      const extConnectorMap: Record<string, () => GraphConnector> = {
        jira: () => new JiraConnector(),
        slack: () => new SlackConnector(),
        ci: () => new CIConnector(),
        confluence: () => new ConfluenceConnector(),
        figma: () => new FigmaConnector(),
        miro: () => new MiroConnector(),
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

// Print the human-readable summary for a completed ingest run. Errors are
// emitted to stderr so JSON consumers stay unaffected when `--json` is set.
// Extracted from the action handler to keep `createIngestCommand` under the
// project cyclomatic-complexity threshold and to make the per-file warning
// behavior independently testable.
function printIngestSummary(result: IngestResult, label: string): void {
  console.log(
    `Ingested (${label}): +${result.nodesAdded} nodes, +${result.edgesAdded} edges (${result.durationMs}ms)`
  );
  if (result.errors.length === 0) return;
  console.warn(`  ${result.errors.length} parse/skip warning(s):`);
  for (const err of result.errors) console.warn(`    - ${err}`);
}

async function handleIngestAction(
  opts: { source?: string; all?: boolean; full?: boolean },
  cmd: Command
): Promise<void> {
  if (!opts.source && !opts.all) {
    console.error('Error: --source or --all is required');
    process.exit(1);
  }
  const globalOpts = cmd.optsWithGlobals();
  const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
  try {
    const runOpts: { full?: boolean; all?: boolean } = {};
    if (opts.full !== undefined) runOpts.full = opts.full;
    if (opts.all !== undefined) runOpts.all = opts.all;
    const result = await runIngest(projectPath, opts.source ?? '', runOpts);
    if (globalOpts.json) {
      console.log(JSON.stringify(result));
    } else {
      printIngestSummary(result, opts.all ? 'all' : (opts.source ?? ''));
    }
  } catch (err) {
    console.error('Ingest failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

export function createIngestCommand(): Command {
  return new Command('ingest')
    .description('Ingest data into the knowledge graph')
    .option(
      '--source <name>',
      'Source to ingest (code, knowledge, git, requirements, business-signals, jira, slack, ci, confluence, figma, miro)'
    )
    .option('--all', 'Run all sources (code, knowledge, git, and configured connectors)')
    .option('--full', 'Force full re-ingestion')
    .action(handleIngestAction);
}
