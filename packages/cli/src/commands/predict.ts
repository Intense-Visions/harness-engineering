import { Command } from 'commander';
import {
  TimelineManager,
  PredictionEngine,
  SpecImpactEstimator,
  ArchConfigSchema,
} from '@harness-engineering/core';
import type {
  ArchMetricCategory,
  PredictionResult,
  AdjustedForecast,
  PredictionWarning,
  ArchConfig,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import chalk from 'chalk';

const CATEGORY_ORDER: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function crossingLabel(weeks: number | null): string {
  if (weeks === null || weeks <= 0) return '--';
  return `~${Math.round(weeks)} weeks`;
}

function severityPrefix(severity: PredictionWarning['severity']): string {
  switch (severity) {
    case 'critical':
      return chalk.red('[critical]');
    case 'warning':
      return chalk.yellow('[warning]');
    case 'info':
      return chalk.blue('[info]');
  }
}

function printPredictionReport(result: PredictionResult): void {
  const sf = result.stabilityForecast;
  const horizonWeeks = 12; // default display horizon

  console.log('');
  console.log(
    `Architecture Prediction (${horizonWeeks}-week horizon, ${result.snapshotsUsed} snapshots)`
  );
  console.log('');
  console.log(
    `  Stability: ${sf.current}/100 -> projected ${sf.projected12w}/100 in 12w (${sf.confidence} confidence)`
  );
  console.log('');

  // Table header
  const header =
    '  ' +
    'Category'.padEnd(20) +
    'Current'.padStart(9) +
    'Threshold'.padStart(11) +
    '4w'.padStart(7) +
    '8w'.padStart(7) +
    '12w'.padStart(7) +
    '   Crossing'.padEnd(16) +
    'Confidence';
  console.log(header);

  for (const category of CATEGORY_ORDER) {
    const af: AdjustedForecast | undefined = result.categories[category];
    if (!af) continue;
    const f = af.adjusted;

    const line =
      '  ' +
      category.padEnd(20) +
      formatValue(f.current).padStart(9) +
      formatValue(f.threshold).padStart(11) +
      formatValue(f.projectedValue4w).padStart(7) +
      formatValue(f.projectedValue8w).padStart(7) +
      formatValue(f.projectedValue12w).padStart(7) +
      ('   ' + crossingLabel(f.thresholdCrossingWeeks)).padEnd(16) +
      f.confidence;
    console.log(line);
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log('');
    console.log('  Warnings:');
    for (const w of result.warnings) {
      console.log(`  ${severityPrefix(w.severity)} ${w.message}`);
      if (w.contributingFeatures.length > 0) {
        console.log(`    Accelerated by: ${w.contributingFeatures.join(', ')}`);
      }
    }
  }

  console.log('');
}

export function runPredict(options: {
  cwd?: string;
  configPath?: string;
  category?: string;
  noRoadmap?: boolean;
  horizon?: number;
}): PredictionResult {
  const cwd = options.cwd ?? process.cwd();

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    throw configResult.error;
  }

  const archConfig: ArchConfig = configResult.value.architecture ?? ArchConfigSchema.parse({});

  const manager = new TimelineManager(cwd);
  const estimator =
    options.noRoadmap === true
      ? null
      : new SpecImpactEstimator(cwd, archConfig.prediction?.coefficients);
  const engine = new PredictionEngine(cwd, manager, estimator);

  const categories = options.category ? [options.category as ArchMetricCategory] : undefined;

  return engine.predict({
    horizon: options.horizon,
    includeRoadmap: options.noRoadmap !== true,
    categories,
  });
}

export function createPredictCommand(): Command {
  const command = new Command('predict')
    .description('Predict which architectural constraints will break and when')
    .option('--category <name>', 'Filter to a single metric category')
    .option('--no-roadmap', 'Baseline only — skip roadmap spec impact')
    .option('--horizon <weeks>', 'Forecast horizon in weeks (default: 12)', '12')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;

      try {
        const result = runPredict({
          configPath: globalOpts.config,
          category: opts.category,
          noRoadmap: opts.roadmap === false,
          horizon: parseInt(opts.horizon, 10),
        });

        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printPredictionReport(result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof CLIError) {
          if (mode === OutputMode.JSON) {
            console.log(JSON.stringify({ error: message }));
          } else {
            logger.error(message);
          }
          process.exit(err.exitCode);
        }
        // PredictionEngine throws plain Error for < 3 snapshots
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(message);
        }
        process.exit(ExitCode.ERROR);
      }
    });

  return command;
}
