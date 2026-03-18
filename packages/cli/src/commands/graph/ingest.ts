import { Command } from 'commander';
import * as path from 'path';
import type { IngestResult } from '@harness-engineering/graph';

export async function runIngest(projectPath: string, source: string): Promise<IngestResult> {
  const { GraphStore, CodeIngestor, TopologicalLinker, KnowledgeIngestor, GitIngestor } =
    await import('@harness-engineering/graph');
  const graphDir = path.join(projectPath, '.harness', 'graph');
  const store = new GraphStore();
  await store.load(graphDir); // Load existing graph if present

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
    default:
      throw new Error(`Unknown source: ${source}. Available: code, knowledge, git`);
  }

  await store.save(graphDir);
  return result;
}

export function createIngestCommand(): Command {
  return new Command('ingest')
    .description('Ingest data into the knowledge graph')
    .requiredOption('--source <name>', 'Source to ingest (code, knowledge, git)')
    .option('--full', 'Force full re-ingestion')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
      try {
        const result = await runIngest(projectPath, opts.source);
        if (globalOpts.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(
            `Ingested (${opts.source}): +${result.nodesAdded} nodes, +${result.edgesAdded} edges (${result.durationMs}ms)`
          );
        }
      } catch (err) {
        console.error('Ingest failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });
}
