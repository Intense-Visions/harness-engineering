import { Command } from 'commander';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolvePersonasDir } from '../../utils/paths';
import {
  checkPersonaWorkflows,
  resolveWorkflowsDir,
  writePersonaWorkflows,
} from '../../persona/generators/repo-workflows';

/** `--check`: verify committed workflows; exit non-zero on any drift. */
function runCheck(personasDir: string, workflowsDir: string, quiet: boolean): never {
  const result = checkPersonaWorkflows(personasDir, workflowsDir);
  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(ExitCode.ERROR);
  }
  const { targets, issues } = result.value;
  if (issues.length > 0) {
    logger.error(
      `Persona workflow drift (${issues.length} issue${issues.length === 1 ? '' : 's'}):`
    );
    for (const issue of issues) {
      logger.error(`  [${issue.kind}] ${issue.filename} — ${issue.detail}`);
    }
    logger.error('\nRun `pnpm generate:persona-workflows` to update.');
    process.exit(ExitCode.ERROR);
  }
  if (!quiet) logger.success(`OK — ${targets.length} persona workflows are up to date.`);
  process.exit(ExitCode.SUCCESS);
}

/** Write mode: regenerate the committed persona workflows. */
function runWrite(personasDir: string, workflowsDir: string, quiet: boolean): never {
  const result = writePersonaWorkflows(personasDir, workflowsDir);
  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(ExitCode.ERROR);
  }
  if (!quiet) {
    logger.success(`Wrote ${result.value.written.length} persona workflows to ${workflowsDir}:`);
    for (const f of result.value.written) console.log(`  - ${f}`);
  }
  process.exit(ExitCode.SUCCESS);
}

/**
 * `harness persona sync-workflows [--check]`
 *
 * Regenerates (or, with `--check`, verifies) the committed `.github/workflows/`
 * files that honor persona-declared triggers (#663). `--check` is the drift
 * guard: it exits non-zero when a persona with a declared CI trigger has a
 * missing, stale, or orphaned committed workflow. Mirrors `generate:plugin:check`.
 */
export function createSyncWorkflowsCommand(): Command {
  return new Command('sync-workflows')
    .description('Generate/verify committed CI workflows for persona-declared triggers')
    .option('--check', 'Verify committed workflows are up to date; exit non-zero on drift', false)
    .action(async (opts, cmd) => {
      const quiet = Boolean(cmd.optsWithGlobals().quiet);
      const personasDir = resolvePersonasDir();
      const workflowsDir = resolveWorkflowsDir(personasDir);
      if (opts.check) runCheck(personasDir, workflowsDir, quiet);
      runWrite(personasDir, workflowsDir, quiet);
    });
}
