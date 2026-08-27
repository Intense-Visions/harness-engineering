import { Command } from 'commander';
import { formatFindingsContract } from '@harness-engineering/types';
import { runGraphStatus } from './status.js';
import { runGraphExport } from './export.js';
import { createScanCommand } from './scan.js';
import { createQueryCommand, createPathCommand } from './query.js';
import { createIngestCommand } from './ingest.js';
import { createBenchCommand } from './bench.js';
import { runGraphIntegrity, printGraphIntegrity } from './integrity.js';
import { ExitCode } from '../../utils/errors.js';
import * as path from 'path';

function resolveProjectPath(globalOpts: { config?: string }): string {
  return path.resolve(globalOpts.config ? path.dirname(globalOpts.config) : '.');
}

function printGraphStatus(result: Awaited<ReturnType<typeof runGraphStatus>>): void {
  if (result.status === 'no_graph' || result.status === 'schema_mismatch') {
    console.log(result.message);
    return;
  }
  console.log(`Graph: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  console.log(`Last scan: ${result.lastScanTimestamp}`);
  if (result.nodesByType) {
    console.log('Nodes by type:');
    for (const [type, count] of Object.entries(result.nodesByType)) {
      console.log(`  ${type}: ${count}`);
    }
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

/**
 * Exit policy mirrors `check-docs` (#1146): a run that inspected nothing exits
 * ZERO_DENOMINATOR so CI can tell "read nothing" from "verified and passed".
 */
async function runIntegrityAction(
  opts: { reportOnly?: boolean; findingsJson?: boolean },
  cmd: Command
): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  let result: Awaited<ReturnType<typeof runGraphIntegrity>>;
  try {
    result = await runGraphIntegrity(resolveProjectPath(globalOpts));
  } catch (err) {
    console.error('Integrity check failed:', err instanceof Error ? err.message : err);
    process.exit(ExitCode.ERROR);
  }

  if (globalOpts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printGraphIntegrity(result);
  }

  const report = result.report;
  if (opts.findingsJson) {
    console.log(formatFindingsContract(report?.findings.length ?? 0, 'graph-integrity'));
  }

  // Nothing inspected — neither pass nor failure.
  if (!report || report.checkedNothing) process.exit(ExitCode.ZERO_DENOMINATOR);

  const hasErrors = report.findings.some((f) => f.severity === 'error');
  if (hasErrors && !opts.reportOnly) process.exit(ExitCode.VALIDATION_FAILED);
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
    .command('integrity')
    .description('Check the graph for content that cannot be trusted')
    .option('--report-only', 'Exit 0 even when error-severity findings exist')
    .option('--findings-json', 'Print the machine-readable findings envelope')
    .action(runIntegrityAction);
  graph
    .command('export')
    .description('Export graph')
    .requiredOption('--format <format>', 'Output format (json, mermaid)')
    .action(runExportAction);
  // `scan`/`query`/`ingest` are canonical under the `graph` group — the update
  // hook and docs refer to `harness graph scan` (see #644). The bare top-level
  // forms remain only as hidden deprecated aliases (see deprecated-aliases.ts).
  graph.addCommand(createScanCommand());
  graph.addCommand(createQueryCommand());
  graph.addCommand(createPathCommand());
  graph.addCommand(createIngestCommand());
  graph.addCommand(createBenchCommand());
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
export { runQuery, runShortestPath } from './query.js';
/**
 * Ingests external data or events into the knowledge graph.
 */
export { runIngest } from './ingest.js';
/**
 * Checks the persisted graph for connector abstentions and extractor debris.
 */
export { runGraphIntegrity, printGraphIntegrity } from './integrity.js';
