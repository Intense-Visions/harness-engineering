import { Command } from 'commander';
import * as path from 'path';
import { loadIngestOptions } from './ingest-options.js';

export async function runScan(projectPath: string): Promise<{
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  durationMs: number;
}> {
  const {
    GraphStore,
    CodeIngestor,
    TopologicalLinker,
    KnowledgeIngestor,
    GitIngestor,
    RequirementIngestor,
    detectCommunities,
  } = await import('@harness-engineering/graph');
  const store = new GraphStore();
  const start = Date.now();

  // Code ingestion (honors `ingest.*` config from harness.config.json).
  // Defer @req-annotation linking: requirement nodes do not exist yet, so annotations
  // must be linked AFTER RequirementIngestor runs, otherwise no verified_by edges form (#949).
  const ingestOptions = loadIngestOptions(projectPath);
  const codeIngestor = new CodeIngestor(store, ingestOptions);
  await codeIngestor.ingest(projectPath, { skipRequirementAnnotations: true });
  new TopologicalLinker(store).link();

  // Knowledge ingestion
  const knowledgeIngestor = new KnowledgeIngestor(store);
  await knowledgeIngestor.ingestAll(projectPath);

  // Flag deletion-based staleness on learning / execution_outcome nodes so NLQ can
  // surface learnings whose cited source files no longer exist (#1514, ADR 0104).
  const { flagStaleLearningNodes } = await import('@harness-engineering/core');
  await flagStaleLearningNodes(store, projectPath);

  // Requirement ingestion (spec traceability)
  const specsDir = path.join(projectPath, 'docs', 'changes');
  await new RequirementIngestor(store).ingestSpecs(specsDir);

  // Link @req annotations now that requirement nodes exist (#949). Runs after
  // RequirementIngestor so annotations resolve to real requirement nodes.
  await codeIngestor.linkRequirementAnnotations(projectPath);

  // Git ingestion (may fail if not a git repo)
  try {
    await new GitIngestor(store).ingest(projectPath);
  } catch {
    /* not a git repo -- skip */
  }

  // Community detection: label each node with the subsystem it belongs to
  // (Louvain modularity maximization). Runs over the fully-built graph so the
  // partition reflects every ingested relationship, and must precede `save` so
  // the `community` labels persist onto nodes through the Serializer.
  const community = detectCommunities(store);

  // Save graph
  const graphDir = path.join(projectPath, '.harness', 'graph');
  await store.save(graphDir);

  return {
    nodeCount: store.nodeCount,
    edgeCount: store.edgeCount,
    communityCount: community.communityCount,
    durationMs: Date.now() - start,
  };
}

export function createScanCommand(): Command {
  return new Command('scan')
    .description('Scan project and build knowledge graph')
    .argument('[path]', 'Project root path', '.')
    .action(async (inputPath, _opts, cmd) => {
      const projectPath = path.resolve(inputPath);
      const globalOpts = cmd.optsWithGlobals();
      try {
        const result = await runScan(projectPath);
        if (globalOpts.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(
            `Graph built: ${result.nodeCount} nodes, ${result.edgeCount} edges, ` +
              `${result.communityCount} communities (${result.durationMs}ms)`
          );
        }
      } catch (err) {
        console.error('Scan failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });
}
