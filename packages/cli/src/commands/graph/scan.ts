import { Command } from 'commander';
import * as path from 'path';

export async function runScan(
  projectPath: string
): Promise<{ nodeCount: number; edgeCount: number; durationMs: number }> {
  const {
    GraphStore,
    CodeIngestor,
    TopologicalLinker,
    KnowledgeIngestor,
    GitIngestor,
    RequirementIngestor,
  } = await import('@harness-engineering/graph');
  const store = new GraphStore();
  const start = Date.now();

  // Code ingestion
  await new CodeIngestor(store).ingest(projectPath);
  new TopologicalLinker(store).link();

  // Knowledge ingestion
  const knowledgeIngestor = new KnowledgeIngestor(store);
  await knowledgeIngestor.ingestAll(projectPath);

  // Requirement ingestion (spec traceability)
  const specsDir = path.join(projectPath, 'docs', 'changes');
  await new RequirementIngestor(store).ingestSpecs(specsDir);

  // Git ingestion (may fail if not a git repo)
  try {
    await new GitIngestor(store).ingest(projectPath);
  } catch {
    /* not a git repo -- skip */
  }

  // Save graph
  const graphDir = path.join(projectPath, '.harness', 'graph');
  await store.save(graphDir);

  return { nodeCount: store.nodeCount, edgeCount: store.edgeCount, durationMs: Date.now() - start };
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
            `Graph built: ${result.nodeCount} nodes, ${result.edgeCount} edges (${result.durationMs}ms)`
          );
        }
      } catch (err) {
        console.error('Scan failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });
}
