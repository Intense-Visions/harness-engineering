import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadCatalog,
  findFixture,
  scoreRecovery,
  RecoveryRecordSchema,
  type RehearsalManifest,
  type RehearsalScore,
} from '@harness-engineering/core';
import { OutputMode, type OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { resolveTemplatesDir } from '../utils/paths';
import { ExitCode } from '../utils/errors';

/** The fixtures ship under templates/rehearsal-fixtures/. */
function resolveFixturesRoot(): string {
  return path.join(resolveTemplatesDir(), 'rehearsal-fixtures');
}

function emitError(mode: OutputModeType, message: string): never {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ error: message }, null, 2));
  } else {
    logger.error(message);
  }
  process.exit(ExitCode.ERROR);
}

function runList(globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }): void {
  const mode = resolveOutputMode(globalOpts);
  const catalog = loadCatalog(resolveFixturesRoot());

  if (mode === OutputMode.JSON) {
    console.log(
      JSON.stringify(
        catalog.map((m) => ({
          id: m.id,
          title: m.title,
          failureMode: m.failureMode,
          difficulty: m.difficulty,
          expectedCheck: m.expectedCheck,
        })),
        null,
        2
      )
    );
    process.exit(ExitCode.SUCCESS);
  }

  if (catalog.length === 0) {
    logger.warn('No rehearsal fixtures found.');
    process.exit(ExitCode.SUCCESS);
  }

  console.log(`Rehearsal fixtures (${catalog.length}):\n`);
  for (const m of catalog) {
    console.log(`  ${m.id}  [${m.failureMode}, ${m.difficulty}]`);
    console.log(`    ${m.title}`);
    console.log(`    exercises: ${m.expectedCheck}\n`);
  }
  console.log('Run `harness rehearse show <fixture-id>` for the full manifest + rubric.');
  process.exit(ExitCode.SUCCESS);
}

function runShow(
  id: string,
  globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }
): void {
  const mode = resolveOutputMode(globalOpts);
  const result = findFixture(resolveFixturesRoot(), id);
  if (!result.ok) emitError(mode, result.error.message);
  const m: RehearsalManifest = result.value;

  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify(m, null, 2));
    process.exit(ExitCode.SUCCESS);
  }

  console.log(`${m.id} — ${m.title}`);
  console.log(`  failure mode: ${m.failureMode}  (difficulty: ${m.difficulty})`);
  console.log(`  exercises:    ${m.expectedCheck}\n`);
  console.log(`  ${m.summary}\n`);
  console.log(`  planted in ${m.plantedFile}:`);
  console.log(`    ${m.plantedDescription}\n`);
  console.log(`  expected fix:`);
  console.log(`    ${m.expectedFix}\n`);
  console.log('  rubric:');
  console.log(`    detected      — ${m.rubric.detected}`);
  console.log(`    correctCheck  — ${m.rubric.correctCheck}`);
  console.log(`    fixed         — ${m.rubric.fixed}`);
  console.log(`    noCollateral  — ${m.rubric.noCollateral}`);
  process.exit(ExitCode.SUCCESS);
}

function renderScore(score: RehearsalScore): void {
  console.log(`Rehearsal: ${score.fixtureId} [${score.failureMode}]`);
  console.log(`  score: ${score.score}/100  (${score.tier.toUpperCase()})\n`);
  for (const d of score.dimensions) {
    const mark = d.credited ? '✓' : '✗';
    const pts = d.credited ? `+${d.weight}` : `0/${d.weight}`;
    console.log(`  ${mark} ${d.name} (${pts}) — ${d.reason}`);
  }
}

function runScore(
  opts: { fixture?: string; recovery?: string; reportOnly?: boolean },
  globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }
): void {
  const mode = resolveOutputMode(globalOpts);

  if (!opts.fixture) emitError(mode, 'Missing --fixture <id>.');
  if (!opts.recovery) emitError(mode, 'Missing --recovery <path> (JSON recovery record).');

  const manifestResult = findFixture(resolveFixturesRoot(), opts.fixture);
  if (!manifestResult.ok) emitError(mode, manifestResult.error.message);
  const manifest = manifestResult.value;

  const recoveryPath = path.resolve(opts.recovery);
  if (!fs.existsSync(recoveryPath)) emitError(mode, `Recovery record not found: ${recoveryPath}`);

  let rawRecovery: unknown;
  try {
    rawRecovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
  } catch (e) {
    emitError(mode, `Invalid JSON in ${recoveryPath}: ${(e as Error).message}`);
  }

  const parsed = RecoveryRecordSchema.safeParse(rawRecovery);
  if (!parsed.success) {
    emitError(mode, `Invalid recovery record: ${parsed.error.message}`);
  }
  const record = parsed.data;

  if (record.fixtureId !== manifest.id) {
    emitError(
      mode,
      `Recovery record fixtureId "${record.fixtureId}" does not match --fixture "${manifest.id}".`
    );
  }

  const score = scoreRecovery(manifest, record);

  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify(score, null, 2));
  } else {
    renderScore(score);
  }

  // A `fail` tier is a real miss (the crux move was not made). Gate on it so
  // the command is usable in a persona-trust or regression pipeline; softenable
  // with --report-only. `partial` and `pass` exit 0.
  const gated = score.tier === 'fail' && !opts.reportOnly;
  process.exit(gated ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
}

export function createRehearseCommand(): Command {
  const command = new Command('rehearse').description(
    'Rehearse an agent against a deliberately-broken fixture and score how well it recovers'
  );

  command
    .command('list')
    .description('List the available rehearsal fixtures and their planted failure modes')
    .action((_opts, cmd) => {
      runList(cmd.optsWithGlobals());
    });

  command
    .command('show <fixture-id>')
    .description('Print one fixture manifest: what was planted, the expected fix, and the rubric')
    .action((fixtureId: string, _opts, cmd) => {
      runShow(fixtureId, cmd.optsWithGlobals());
    });

  command
    .command('score')
    .description('Score a recovery attempt against a fixture (0-100 + pass/partial/fail tier)')
    .requiredOption('--fixture <id>', 'Fixture id to score against')
    .requiredOption('--recovery <path>', 'Path to a JSON recovery record')
    .option('--report-only', 'Always exit 0, even on a fail-tier score')
    .action((opts, cmd) => {
      runScore(opts, cmd.optsWithGlobals());
    });

  return command;
}
