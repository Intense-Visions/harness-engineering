import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { logger } from '../output/logger';

/**
 * `harness distortion` — report-only rate-distortion ablation harness (issue #1633).
 *
 * Reads recorded ablation-replay observations, fits a task-conditioned distortion
 * model (sensitivity matrix over information class × task class), and emits it as
 * JSON + Markdown. Measurement only: this command never touches the live
 * compaction path — it reads observations and writes a report.
 */

/** Default input: pre-recorded ablation-replay observations (one per line). */
const DEFAULT_INPUT = path.join('.harness', 'metrics', 'ablation-replays.jsonl');
/** Default output: the fitted distortion model. */
const DEFAULT_MODEL_OUT = path.join('.harness', 'metrics', 'distortion-model.json');
/** Optional #1632 refinement-demand log, foldable as an advisory prior. */
const REFINEMENT_EVENTS = path.join('.harness', 'metrics', 'refinement-events.jsonl');

type ReplayObservation = import('@harness-engineering/core').ReplayObservation;
type InformationClass = import('@harness-engineering/core').InformationClass;

/**
 * Read newline-delimited {@link ReplayObservation} records. Blank lines are
 * skipped; a malformed line is a hard error (a distortion report built on
 * silently-dropped observations would be a lie).
 */
function readObservations(inputPath: string): ReplayObservation[] {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const observations: ReplayObservation[] = [];
  let lineNo = 0;
  for (const line of raw.split('\n')) {
    lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      observations.push(JSON.parse(trimmed) as ReplayObservation);
    } catch {
      throw new Error(`Malformed observation at ${inputPath}:${lineNo}`);
    }
  }
  return observations;
}

/**
 * Best-effort advisory prior from the #1632 refinement-demand log: map each
 * refinement domain's frequency onto the information classes it informs. Returns
 * undefined when the log is absent (the prior is optional).
 */
function readAdvisoryPrior(
  projectPath: string,
  aggregateDemand: typeof import('@harness-engineering/core').aggregateDemand
): Partial<Record<InformationClass, number>> | undefined {
  let report: import('@harness-engineering/core').RefinementDemandReport;
  try {
    const raw = fs.readFileSync(path.join(projectPath, REFINEMENT_EVENTS), 'utf-8');
    const requests = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as import('@harness-engineering/core').RefinementRequest);
    report = aggregateDemand(requests);
  } catch {
    return undefined;
  }

  // Map progressive-domain demand onto the ablation information classes it bears on.
  const freq = (cls: string): number =>
    report.byClass.find((c) => c.contextClass === cls)?.frequency ?? 0;
  return {
    'prior-tool-results': freq('telemetry'),
    'code-excerpts': freq('file-content'),
    'conversational-history': freq('history'),
    'resolved-decisions': freq('knowledge'),
    // stated-constraints has no refinement-domain proxy; left unset (undefined).
  };
}

interface FitCommandOptions {
  input?: string;
  out?: string;
  markdown?: string;
  versionTag?: string;
  threshold?: string;
  prior?: boolean;
  /** commander negation: `--no-write` sets this to `false`. */
  write?: boolean;
}

type Core = typeof import('@harness-engineering/core');
type DistortionModel = import('@harness-engineering/core').DistortionModel;

/** Build the {@link FitOptions} for the core fit from CLI flags. */
function buildFitOptions(
  opts: FitCommandOptions,
  cwd: string,
  core: Core
): import('@harness-engineering/core').FitOptions {
  const prior = opts.prior ? readAdvisoryPrior(cwd, core.aggregateDemand) : undefined;
  const threshold = opts.threshold !== undefined ? Number.parseFloat(opts.threshold) : undefined;
  return {
    ...(opts.versionTag ? { version: opts.versionTag } : {}),
    ...(threshold !== undefined && Number.isFinite(threshold) ? { threshold } : {}),
    ...(prior ? { prior } : {}),
  };
}

/** Write the model JSON (and optional Markdown) to disk, logging each path. */
function writeModelFiles(
  model: DistortionModel,
  markdown: string,
  opts: FitCommandOptions,
  cwd: string
): void {
  const modelOut = path.resolve(cwd, opts.out ?? DEFAULT_MODEL_OUT);
  fs.mkdirSync(path.dirname(modelOut), { recursive: true });
  fs.writeFileSync(modelOut, JSON.stringify(model, null, 2), 'utf-8');
  logger.info(`Distortion model written to ${path.relative(cwd, modelOut).replaceAll('\\', '/')}`);

  if (opts.markdown) {
    const mdOut = path.resolve(cwd, opts.markdown);
    fs.mkdirSync(path.dirname(mdOut), { recursive: true });
    fs.writeFileSync(mdOut, markdown, 'utf-8');
    logger.info(`Distortion report written to ${path.relative(cwd, mdOut).replaceAll('\\', '/')}`);
  }
}

/** The `distortion fit` action: read observations, fit, emit the report. */
async function runFit(opts: FitCommandOptions, jsonOutput: boolean): Promise<void> {
  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, opts.input ?? DEFAULT_INPUT);

  if (!fs.existsSync(inputPath)) {
    const rel = path.relative(cwd, inputPath).replaceAll('\\', '/');
    logger.warn(
      `No ablation-replay observations at ${rel}. ` +
        'Record replays there (or pass --input) before fitting.'
    );
    if (jsonOutput) console.log(JSON.stringify(null));
    return;
  }

  const core = await import('@harness-engineering/core');
  const observations = readObservations(inputPath);
  const model = core.fitDistortionModel(observations, buildFitOptions(opts, cwd, core));

  if (jsonOutput) {
    console.log(JSON.stringify(model, null, 2));
    return;
  }

  const markdown = core.serializeDistortionModel(model);
  if (opts.write === false) {
    console.log(markdown);
    return;
  }

  writeModelFiles(model, markdown, opts, cwd);
  const sensitive = model.cells.filter((c) => c.sensitivity === 'sensitive').length;
  logger.info(
    `${observations.length} observations · ${model.runsObserved} runs · ` +
      `${model.taskClasses.length} task classes · ${sensitive} sensitive cell(s)`
  );
}

function registerFitCommand(distortion: Command): void {
  distortion
    .command('fit')
    .description('Fit a distortion model from recorded ablation-replay observations (report-only)')
    .option('--input <path>', `Observations JSONL (default: ${DEFAULT_INPUT})`)
    .option('--out <path>', `Write the model JSON to this path (default: ${DEFAULT_MODEL_OUT})`)
    .option('--markdown <path>', 'Also write the Markdown report to this path')
    .option('--version-tag <v>', 'Model version to stamp (default: 1.0.0)')
    .option('--threshold <n>', 'Noise threshold for the rework delta (default: 0.5)')
    .option('--prior', 'Fold the #1632 refinement-demand log in as an advisory prior')
    .option('--no-write', 'Print the model instead of writing files')
    .action((opts: FitCommandOptions, cmd: Command) =>
      runFit(opts, Boolean(cmd.optsWithGlobals().json))
    );
}

export function createDistortionCommand(): Command {
  const distortion = new Command('distortion')
    .description('Rate-distortion context compaction — report-only ablation harness (#1633)')
    .option('--json', 'Output in JSON format');

  registerFitCommand(distortion);

  return distortion;
}
