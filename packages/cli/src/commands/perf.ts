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
      const cwd = process.cwd();

      const { BenchmarkRunner } = await import('@harness-engineering/core');
      const runner = new BenchmarkRunner();

      // First check if any bench files exist
      const benchFiles = runner.discover(cwd, glob);
      if (benchFiles.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify({ benchFiles: [], message: 'No .bench.ts files found' }));
        } else {
          logger.info('No .bench.ts files found. Create *.bench.ts files to add benchmarks.');
        }
        return;
      }

      if (globalOpts.json) {
        logger.info(`Found ${benchFiles.length} benchmark file(s). Running...`);
      } else {
        logger.info(`Found ${benchFiles.length} benchmark file(s):`);
        for (const f of benchFiles) {
          logger.info(`  ${f}`);
        }
        logger.info('Running benchmarks...');
      }

      const result = await runner.run(glob ? { cwd, glob } : { cwd });

      if (globalOpts.json) {
        console.log(JSON.stringify({ results: result.results, success: result.success }));
      } else {
        if (result.success && result.results.length > 0) {
          logger.info(`\nResults (${result.results.length} benchmarks):`);
          for (const r of result.results) {
            logger.info(
              `  ${r.file}::${r.name}: ${r.opsPerSec} ops/s (mean: ${r.meanMs.toFixed(2)}ms)`
            );
          }
          logger.info('\nTo save as baselines: harness perf baselines update');
        } else {
          logger.info('Benchmark run completed. Check output above for details.');
          if (result.rawOutput) {
            console.log(result.rawOutput);
          }
        }
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
      const cwd = process.cwd();

      const { BenchmarkRunner } = await import('@harness-engineering/core');
      const runner = new BenchmarkRunner();
      const manager = new BaselineManager(cwd);

      logger.info('Running benchmarks to update baselines...');
      const benchResult = await runner.run({ cwd });

      if (!benchResult.success || benchResult.results.length === 0) {
        logger.error(
          'No benchmark results to save. Run `harness perf bench` first to verify benchmarks work.'
        );
        return;
      }

      // Get current commit hash
      let commitHash = 'unknown';
      try {
        const { execSync } = await import('node:child_process');
        commitHash = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
      } catch {
        /* ignore */
      }

      manager.save(benchResult.results, commitHash);

      if (globalOpts.json) {
        console.log(JSON.stringify({ updated: benchResult.results.length, commitHash }));
      } else {
        logger.info(`Updated ${benchResult.results.length} baseline(s) from commit ${commitHash}`);
        logger.info('Baselines saved to .harness/perf/baselines.json');
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
