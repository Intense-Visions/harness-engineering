import { Command } from 'commander';
import * as path from 'path';
import { loadState } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

export function createShowCommand(): Command {
  return new Command('show')
    .description('Show current project state')
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectPath = path.resolve(opts.path);
      const result = await loadState(projectPath, opts.stream);

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }

      const state = result.value;
      if (globalOpts.json) {
        logger.raw(state);
      } else if (globalOpts.quiet) {
        console.log(JSON.stringify(state));
      } else {
        if (opts.stream) console.log(`Stream:         ${opts.stream}`);
        console.log(`Schema Version: ${state.schemaVersion}`);
        if (state.position.phase) console.log(`Phase:          ${state.position.phase}`);
        if (state.position.task) console.log(`Task:           ${state.position.task}`);
        if (state.lastSession) {
          console.log(`Last Session:   ${state.lastSession.date} — ${state.lastSession.summary}`);
        }
        if (Object.keys(state.progress).length > 0) {
          console.log('\nProgress:');
          for (const [task, status] of Object.entries(state.progress)) {
            console.log(`  ${task}: ${status}`);
          }
        }
        if (state.decisions.length > 0) {
          console.log(`\nDecisions: ${state.decisions.length}`);
        }
        if (state.blockers.length > 0) {
          const open = state.blockers.filter((b) => b.status === 'open').length;
          console.log(`Blockers:   ${open} open / ${state.blockers.length} total`);
        }
      }
      process.exit(ExitCode.SUCCESS);
    });
}
