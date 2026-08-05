import { Command } from 'commander';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveProjectPersonasDir } from '../../utils/paths';
import {
  checkPersonaWorkflows,
  resolveWorkflowsDir,
  writePersonaWorkflows,
  type PersonaWorkflowRenderOptions,
} from '../../persona/generators/repo-workflows';

/** `--check`: verify committed workflows; exit non-zero on any drift. */
function runCheck(
  personasDir: string,
  workflowsDir: string,
  options: PersonaWorkflowRenderOptions,
  quiet: boolean
): never {
  const result = checkPersonaWorkflows(personasDir, workflowsDir, options);
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
function runWrite(
  personasDir: string,
  workflowsDir: string,
  options: PersonaWorkflowRenderOptions,
  quiet: boolean
): never {
  const result = writePersonaWorkflows(personasDir, workflowsDir, options);
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
 * `harness persona sync-workflows [--check] [--runner <npx|workspace>] [--advisory]`
 *
 * Regenerates (or, with `--check`, verifies) the committed `.github/workflows/`
 * files that honor a PROJECT's persona-declared triggers. `--check` is the drift
 * guard: it exits non-zero when a persona with a declared CI trigger has a
 * missing, stale, or orphaned committed workflow.
 *
 * Defaults target adopters: the published CLI invoked via `npx`, blocking on
 * findings. The harness repo itself passes `--runner workspace --advisory` to
 * build the CLI from source and wire the jobs non-blocking first.
 */
export function createSyncWorkflowsCommand(): Command {
  return new Command('sync-workflows')
    .description('Generate/verify committed CI workflows for persona-declared triggers')
    .option('--check', 'Verify committed workflows are up to date; exit non-zero on drift', false)
    .option(
      '--runner <runner>',
      'How the CLI is invoked in each step: "npx" (published CLI, default) or "workspace" (build from source)',
      'npx'
    )
    .option(
      '--advisory',
      'Emit continue-on-error jobs (report findings without failing the check)',
      false
    )
    .action(async (opts, cmd) => {
      const quiet = Boolean(cmd.optsWithGlobals().quiet);
      if (opts.runner !== 'npx' && opts.runner !== 'workspace') {
        logger.error(`Invalid --runner: ${opts.runner}. Must be "npx" or "workspace".`);
        process.exit(ExitCode.ERROR);
      }
      // Resolve the PROJECT's personas — never the CLI's bundled fallback, so we
      // never write harness's own personas into an adopter's node_modules.
      const personasDir = resolveProjectPersonasDir();
      if (!personasDir) {
        logger.error(
          'No agents/personas directory found in this project. Run from your project root, ' +
            'or create agents/personas/ with persona definitions first.'
        );
        process.exit(ExitCode.ERROR);
      }
      const options: PersonaWorkflowRenderOptions = {
        runner: opts.runner,
        advisory: Boolean(opts.advisory),
      };
      const workflowsDir = resolveWorkflowsDir(personasDir);
      if (opts.check) runCheck(personasDir, workflowsDir, options, quiet);
      runWrite(personasDir, workflowsDir, options, quiet);
    });
}
