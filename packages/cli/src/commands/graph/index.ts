import { Command } from 'commander';
import { runGraphStatus } from './status.js';
import { runGraphExport } from './export.js';
import * as path from 'path';

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

// Re-export run functions for direct use and testing
export { runGraphStatus } from './status.js';
export { runGraphExport } from './export.js';
export { runScan } from './scan.js';
export { runQuery } from './query.js';
export { runIngest } from './ingest.js';
