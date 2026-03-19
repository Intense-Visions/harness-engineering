import { Command } from 'commander';
import * as path from 'path';
import { BaselineManager, CriticalPathResolver } from '@harness-engineering/core';
import { logger } from '../output/logger';

export function createPerfCommand(): Command {
  const perf = new Command('perf').description('Performance benchmark and baseline management');

  // harness perf bench [glob]
  perf
    .command('bench [glob]')
    .description('Run benchmarks via vitest bench')
    .action(async (glob: string | undefined, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const pattern = glob ?? '**/*.bench.ts';
      const command = `npx vitest bench ${pattern}`;

      if (globalOpts.json) {
        console.log(
          JSON.stringify({ command, instructions: 'Run this command to execute benchmarks' })
        );
      } else {
        logger.info(`Run benchmarks with: ${command}`);
        logger.info('Then update baselines with: harness perf baselines update');
      }
    });

  // harness perf baselines
  const baselines = perf.command('baselines').description('Manage performance baselines');

  // harness perf baselines show
  baselines
    .command('show')
    .description('Display current baselines')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const manager = new BaselineManager(cwd);
      const data = manager.load();

      if (!data) {
        if (globalOpts.json) {
          console.log(JSON.stringify({ baselines: null, message: 'No baselines file found' }));
        } else {
          logger.info('No baselines file found at .harness/perf/baselines.json');
        }
        return;
      }

      if (globalOpts.json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        logger.info(`Baselines (updated: ${data.updatedAt}, from: ${data.updatedFrom})`);
        for (const [name, baseline] of Object.entries(data.benchmarks)) {
          logger.info(
            `  ${name}: ${baseline.opsPerSec} ops/s (mean: ${baseline.meanMs}ms, p99: ${baseline.p99Ms}ms)`
          );
        }
      }
    });

  // harness perf baselines update
  baselines
    .command('update')
    .description('Update baselines from latest benchmark run')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      if (globalOpts.json) {
        console.log(
          JSON.stringify({ instructions: 'Run vitest bench first, then pipe results to update' })
        );
      } else {
        logger.info('To update baselines:');
        logger.info('  1. Run: npx vitest bench --reporter=json > bench-results.json');
        logger.info('  2. Parse results and call BaselineManager.save()');
        logger.info('  3. Or use the update_perf_baselines MCP tool');
      }
    });

  // harness perf report
  perf
    .command('report')
    .description('Full performance report with metrics, trends, and hotspots')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { EntropyAnalyzer } = await import('@harness-engineering/core');
      const analyzer = new EntropyAnalyzer({
        rootDir: path.resolve(cwd),
        analyze: { complexity: true, coupling: true },
      });

      const result = await analyzer.analyze();
      if (!result.ok) {
        logger.error(result.error.message);
        return;
      }

      const report = result.value;
      if (globalOpts.json) {
        console.log(
          JSON.stringify(
            {
              complexity: report.complexity,
              coupling: report.coupling,
              sizeBudget: report.sizeBudget,
            },
            null,
            2
          )
        );
      } else {
        logger.info('=== Performance Report ===');
        if (report.complexity) {
          logger.info(
            `Complexity: ${report.complexity.stats.violationCount} violations (${report.complexity.stats.errorCount} errors, ${report.complexity.stats.warningCount} warnings)`
          );
        }
        if (report.coupling) {
          logger.info(
            `Coupling: ${report.coupling.stats.violationCount} violations (${report.coupling.stats.warningCount} warnings)`
          );
        }
      }
    });

  // harness perf critical-paths
  perf
    .command('critical-paths')
    .description('Show resolved critical path set (annotations + graph inference)')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const resolver = new CriticalPathResolver(cwd);
      const result = await resolver.resolve();

      if (globalOpts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        logger.info(
          `Critical paths: ${result.stats.total} (${result.stats.annotated} annotated, ${result.stats.graphInferred} graph-inferred)`
        );
        for (const entry of result.entries) {
          logger.info(
            `  ${entry.file}::${entry.function} [${entry.source}]${entry.fanIn ? ` (fan-in: ${entry.fanIn})` : ''}`
          );
        }
      }
    });

  return perf;
}
