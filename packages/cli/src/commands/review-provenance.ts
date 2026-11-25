import { Command } from 'commander';
import { runReviewProvenanceRender, type CwdGit } from '../review-receipts/provenance';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

export type { ReviewProvenanceReport } from '../review-receipts/provenance';
export { runReviewProvenanceRender };

/** Injected inputs for tests. */
export interface ReviewProvenanceDeps {
  cwd?: () => string;
  git?: CwdGit;
}

/** Flags and printing only; the stamp is built in review-receipts/provenance.ts. */
export function createReviewProvenanceCommand(deps: ReviewProvenanceDeps = {}): Command {
  const command = new Command('review-provenance').description(
    'Show which reviews ran for a pipeline session: tier, reviewers run of required, diff range, coverage, gate result'
  );
  command.addCommand(
    new Command('render')
      .description(
        'Print the Markdown provenance stamp for a session, for the PR body: one row per review ' +
          'the session calls for and per review directory, MISSING for one that never ran. ' +
          'Re-runs the receipt gate for each review (a reviewed head may be an ancestor of HEAD)'
      )
      .requiredOption('--session <slug>', 'Session whose review receipts to read')
      .action((opts: { session: string }, cmd: Command) => {
        const out = runReviewProvenanceRender({
          session: opts.session,
          ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
          ...(deps.git !== undefined && { git: deps.git }),
        });
        if (!out.ok) {
          logger.error(out.error.message);
          process.exitCode = ExitCode.VALIDATION_FAILED;
          return;
        }
        if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
          console.log(JSON.stringify(out.value, null, 2));
          return;
        }
        console.log(out.value.block);
      })
  );
  return command;
}
