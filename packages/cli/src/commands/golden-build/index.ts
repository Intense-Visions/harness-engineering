import { Command } from 'commander';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import {
  runGoldenPromote,
  runGoldenVerify,
  runGoldenDiff,
  type GoldenVerifyResult,
} from './runners';

function collectPath(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function shortHash(hash?: string): string {
  return hash ? hash.slice(0, 12) : '—';
}

function printDiffHuman(result: GoldenVerifyResult): void {
  const { diff, golden } = result;
  if (golden) {
    logger.info(`Golden promoted from ${golden.commit} (${golden.branch}) at ${golden.promotedAt}`);
  }
  if (diff.clean) {
    logger.success('Working tree matches the golden build. No drift.');
    return;
  }
  for (const c of diff.changed) {
    logger.warn(`changed  ${c.path}  ${shortHash(c.goldenHash)} -> ${shortHash(c.currentHash)}`);
  }
  for (const c of diff.missing) {
    logger.warn(`missing  ${c.path}  (was ${shortHash(c.goldenHash)}, now absent)`);
  }
  for (const c of diff.added) {
    logger.warn(`added    ${c.path}  ${shortHash(c.currentHash)} (not in golden)`);
  }
}

function isJson(cmd: Command): boolean {
  return Boolean(cmd.optsWithGlobals().json);
}

function createPromoteSubcommand(): Command {
  return new Command('promote')
    .description('Snapshot the current working tree as the golden (known-good) reference state')
    .option(
      '--path <path>',
      'Reference file to fingerprint (repeatable; overrides config)',
      collectPath,
      []
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const result = await runGoldenPromote({ configPath: globalOpts.config, paths: opts.path });
      if (!result.ok) {
        if (isJson(cmd)) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
      const v = result.value;
      if (isJson(cmd)) {
        console.log(JSON.stringify(v, null, 2));
      } else if (v.changed) {
        logger.success(
          `Golden build promoted: ${v.fileCount} reference file(s) from ${v.commit} (${v.branch}).`
        );
        logger.info(`Manifest written to ${v.manifestPath}`);
      } else {
        logger.info('Golden build unchanged (fingerprint identical) — manifest left byte-stable.');
      }
      process.exit(ExitCode.SUCCESS);
    });
}

function createVerifySubcommand(): Command {
  return new Command('verify')
    .description('Verify the working tree against the most recent golden; exits non-zero on drift')
    .option(
      '--path <path>',
      'Reference file to fingerprint (repeatable; overrides config)',
      collectPath,
      []
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const result = await runGoldenVerify({ configPath: globalOpts.config, paths: opts.path });
      if (!result.ok) {
        if (isJson(cmd)) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
      const v = result.value;
      if (isJson(cmd)) console.log(JSON.stringify(v, null, 2));
      else printDiffHuman(v);
      process.exit(v.clean ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}

function createDiffSubcommand(): Command {
  return new Command('diff')
    .description('Show what has drifted since the last golden build (advisory; always exits 0)')
    .option(
      '--path <path>',
      'Reference file to fingerprint (repeatable; overrides config)',
      collectPath,
      []
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const result = await runGoldenDiff({ configPath: globalOpts.config, paths: opts.path });
      if (!result.ok) {
        if (isJson(cmd)) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
      const v = result.value;
      if (isJson(cmd)) {
        console.log(JSON.stringify(v, null, 2));
      } else if (!v.golden) {
        logger.info('No golden build has been promoted yet. Run `harness golden-build promote`.');
      } else {
        printDiffHuman(v);
      }
      process.exit(ExitCode.SUCCESS);
    });
}

/**
 * Top-level `harness golden-build` command group — the reference-state
 * primitive. Captures a known-good "golden" fingerprint (`promote`), checks the
 * working tree against it (`verify`), and explains drift (`diff`).
 */
export function createGoldenBuildCommand(): Command {
  const command = new Command('golden-build').description(
    'Capture, verify, and diff a golden (known-good) reference state of the repo'
  );
  command.addCommand(createPromoteSubcommand());
  command.addCommand(createVerifySubcommand());
  command.addCommand(createDiffSubcommand());
  return command;
}

export {
  runGoldenPromote,
  runGoldenVerify,
  runGoldenDiff,
  type GoldenCommandOptions,
  type GoldenPromoteResult,
  type GoldenVerifyResult,
} from './runners';
