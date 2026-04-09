import { Command } from 'commander';
import { runGraphStatus } from './status.js';
import { runGraphExport } from './export.js';
import * as path from 'path';

function resolveProjectPath(globalOpts: { config?: string }): string {
  return path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
}

function printGraphStatus(result: Awaited<ReturnType<typeof runGraphStatus>>): void {
  if (result.status === 'no_graph') {
    console.log(result.message);
    return;
  }
  console.log(`Graph: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  console.log(`Last scan: ${result.lastScanTimestamp}`);
  console.log('Nodes by type:');
  for (const [type, count] of Object.entries(result.nodesByType!)) {
    console.log(`  ${type}: ${count}`);
  }
  if (!result.connectorSyncStatus) return;
  console.log('Connector sync status:');
  for (const [name, timestamp] of Object.entries(result.connectorSyncStatus)) {
    console.log(`  ${name}: last synced ${timestamp}`);
  }
}

async function runStatusAction(_opts: unknown, cmd: Command): Promise<void> {
  try {
    const globalOpts = cmd.optsWithGlobals();
    const result = await runGraphStatus(resolveProjectPath(globalOpts));
    if (globalOpts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printGraphStatus(result);
    }
  } catch (err) {
    console.error('Status failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

async function runExportAction(opts: { format: string }, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  try {
    const output = await runGraphExport(resolveProjectPath(globalOpts), opts.format);
    console.log(output);
  } catch (err) {
    console.error('Export failed:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}

/**
 * Creates and configures the 'graph' command group for knowledge graph management.
 *
 * @returns A Commander instance for the 'graph' command.
 */
export function createGraphCommand(): Command {
  const graph = new Command('graph').description('Knowledge graph management');
  graph.command('status').description('Show graph statistics').action(runStatusAction);
  graph
    .command('export')
    .description('Export graph')
    .requiredOption('--format <format>', 'Output format (json, mermaid)')
    .action(runExportAction);
  return graph;
}

/**
 * Shows the current status and statistics of the knowledge graph.
 */
export { runGraphStatus } from './status.js';
/**
 * Exports the knowledge graph to a specified format (e.g. JSON, Mermaid).
 */
export { runGraphExport } from './export.js';
/**
 * Scans the codebase and updates the knowledge graph.
 */
export { runScan } from './scan.js';
/**
 * Executes a query against the knowledge graph.
 */
export { runQuery } from './query.js';
/**
 * Ingests external data or events into the knowledge graph.
 */
export { runIngest } from './ingest.js';
