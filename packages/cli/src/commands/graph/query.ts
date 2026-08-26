import { Command } from 'commander';
import * as path from 'path';
import type {
  ContextQLResult,
  ContextQLParams,
  NodeType,
  EdgeType,
  ShortestPathResult,
  ShortestPathDirection,
} from '@harness-engineering/graph';

export async function runQuery(
  projectPath: string,
  rootNodeId: string,
  opts: { depth?: number; types?: string; edges?: string; bidirectional?: boolean }
): Promise<ContextQLResult> {
  const { GraphStore, ContextQL, resolveGraphDir } = await import('@harness-engineering/graph');
  const store = new GraphStore();
  const graphDir = resolveGraphDir(projectPath);
  const loaded = await store.load(graphDir);
  if (!loaded) throw new Error('No graph found. Run `harness graph scan` first.');

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

function printQueryResult(result: ContextQLResult): void {
  console.log(
    `Found ${result.nodes.length} nodes, ${result.edges.length} edges (depth ${result.stats.depthReached}, pruned ${result.stats.pruned})`
  );
  for (const node of result.nodes) {
    console.log(`  ${node.type.padEnd(12)} ${node.id}`);
  }
}

async function runQueryAction(
  rootNodeId: string,
  opts: { depth: string; types?: string; edges?: string; bidirectional?: boolean },
  globalOpts: { config?: string; json?: boolean }
): Promise<void> {
  const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
  try {
    const result = await runQuery(projectPath, rootNodeId, {
      depth: parseInt(opts.depth),
      ...(opts.types !== undefined && { types: opts.types }),
      ...(opts.edges !== undefined && { edges: opts.edges }),
      ...(opts.bidirectional !== undefined && { bidirectional: opts.bidirectional }),
    });
    if (globalOpts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printQueryResult(result);
    }
  } catch (err) {
    console.error('Query failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
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
      await runQueryAction(rootNodeId, opts, cmd.optsWithGlobals());
    });
}

const SHORTEST_PATH_DIRECTIONS: readonly ShortestPathDirection[] = ['outbound', 'inbound', 'both'];

export async function runShortestPath(
  projectPath: string,
  fromId: string,
  toId: string,
  opts: { direction?: ShortestPathDirection }
): Promise<ShortestPathResult | null> {
  const { GraphStore, ContextQL, resolveGraphDir } = await import('@harness-engineering/graph');
  const store = new GraphStore();
  const graphDir = resolveGraphDir(projectPath);
  const loaded = await store.load(graphDir);
  if (!loaded) throw new Error('No graph found. Run `harness graph scan` first.');

  const cql = new ContextQL(store);
  return cql.shortestPath(fromId, toId, {
    direction: opts.direction ?? 'both',
  });
}

function printShortestPath(result: ShortestPathResult | null, fromId: string, toId: string): void {
  if (result === null) {
    console.log(`No path found between ${fromId} and ${toId}.`);
    return;
  }
  if (result.length === 0) {
    console.log(`${fromId} and ${toId} are the same node.`);
    return;
  }
  console.log(`Shortest path: ${result.length} hop${result.length === 1 ? '' : 's'}`);
  console.log(`  ${result.nodes.map((n) => n.id).join(' -> ')}`);
}

function parseDirection(raw: string | undefined): ShortestPathDirection {
  if (raw === undefined) return 'both';
  if ((SHORTEST_PATH_DIRECTIONS as readonly string[]).includes(raw)) {
    return raw as ShortestPathDirection;
  }
  throw new Error(
    `Invalid --direction "${raw}". Expected one of: ${SHORTEST_PATH_DIRECTIONS.join(', ')}.`
  );
}

async function runShortestPathAction(
  fromId: string,
  toId: string,
  opts: { direction?: string },
  globalOpts: { config?: string; json?: boolean }
): Promise<void> {
  const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
  try {
    const direction = parseDirection(opts.direction);
    const result = await runShortestPath(projectPath, fromId, toId, { direction });
    if (globalOpts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printShortestPath(result, fromId, toId);
    }
    // Exit non-zero when no path connects the pair so scripts can branch on it.
    if (result === null) process.exit(1);
  } catch (err) {
    console.error('Path query failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

export function createPathCommand(): Command {
  return new Command('path')
    .description('Find the shortest path between two nodes')
    .argument('<sourceNodeId>', 'Source node ID')
    .argument('<targetNodeId>', 'Target node ID')
    .option('--direction <direction>', 'Traversal direction: outbound, inbound, or both', 'both')
    .action(async (sourceNodeId, targetNodeId, opts, cmd) => {
      await runShortestPathAction(sourceNodeId, targetNodeId, opts, cmd.optsWithGlobals());
    });
}
