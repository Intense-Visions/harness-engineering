import { Command } from 'commander';
import * as path from 'path';
import type {
  ContextQLResult,
  ContextQLParams,
  NodeType,
  EdgeType,
} from '@harness-engineering/graph';

export async function runQuery(
  projectPath: string,
  rootNodeId: string,
  opts: { depth?: number; types?: string; edges?: string; bidirectional?: boolean }
): Promise<ContextQLResult> {
  const { GraphStore, ContextQL } = await import('@harness-engineering/graph');
  const store = new GraphStore();
  const graphDir = path.join(projectPath, '.harness', 'graph');
  const loaded = await store.load(graphDir);
  if (!loaded) throw new Error('No graph found. Run `harness scan` first.');

  const params: ContextQLParams = {
    rootNodeIds: [rootNodeId],
    maxDepth: opts.depth ?? 3,
    bidirectional: opts.bidirectional ?? false,
    ...(opts.types ? { includeTypes: opts.types.split(',') as NodeType[] } : {}),
    ...(opts.edges ? { includeEdges: opts.edges.split(',') as EdgeType[] } : {}),
  };

  const cql = new ContextQL(store);
  return cql.execute(params);
}

export function createQueryCommand(): Command {
  return new Command('query')
    .description('Query the knowledge graph')
    .argument('<rootNodeId>', 'Starting node ID')
    .option('--depth <n>', 'Max traversal depth', '3')
    .option('--types <types>', 'Comma-separated node types to include')
    .option('--edges <edges>', 'Comma-separated edge types to include')
    .option('--bidirectional', 'Traverse both directions')
    .action(async (rootNodeId, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
      try {
        const result = await runQuery(projectPath, rootNodeId, {
          depth: parseInt(opts.depth),
          types: opts.types,
          edges: opts.edges,
          bidirectional: opts.bidirectional,
        });
        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(
            `Found ${result.nodes.length} nodes, ${result.edges.length} edges (depth ${result.stats.depthReached}, pruned ${result.stats.pruned})`
          );
          for (const node of result.nodes) {
            console.log(`  ${node.type.padEnd(12)} ${node.id}`);
          }
        }
      } catch (err) {
        console.error('Query failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });
}
