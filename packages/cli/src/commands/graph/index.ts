import { Command } from 'commander';
import { runGraphStatus } from './status.js';
import { runGraphExport } from './export.js';
import * as path from 'path';

/**
 * Creates and configures the 'graph' command group for knowledge graph management.
 *
 * @returns A Commander instance for the 'graph' command.
 */
export function createGraphCommand(): Command {
  const graph = new Command('graph').description('Knowledge graph management');

  graph
    .command('status')
    .description('Show graph statistics')
    .action(async (_opts, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
        const result = await runGraphStatus(projectPath);
        if (globalOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.status === 'no_graph') {
          console.log(result.message);
        } else {
          console.log(`Graph: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
          console.log(`Last scan: ${result.lastScanTimestamp}`);
          console.log('Nodes by type:');
          for (const [type, count] of Object.entries(result.nodesByType!)) {
            console.log(`  ${type}: ${count}`);
          }
          if (result.connectorSyncStatus) {
            console.log('Connector sync status:');
            for (const [name, timestamp] of Object.entries(result.connectorSyncStatus)) {
              console.log(`  ${name}: last synced ${timestamp}`);
            }
          }
        }
      } catch (err) {
        console.error('Status failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });

  graph
    .command('export')
    .description('Export graph')
    .requiredOption('--format <format>', 'Output format (json, mermaid)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectPath = path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
      try {
        const output = await runGraphExport(projectPath, opts.format);
        console.log(output);
      } catch (err) {
        console.error('Export failed:', err instanceof Error ? err.message : err);
        process.exit(2);
      }
    });

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
