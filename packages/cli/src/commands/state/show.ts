import { Command } from 'commander';
import * as path from 'path';
import { loadState } from '@harness-engineering/core';
import type { HarnessState } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

function printStateText(state: HarnessState, stream?: string): void {
  if (stream) console.log(`Stream:         ${stream}`);
  console.log(`Schema Version: ${state.schemaVersion}`);
  if (state.position.phase) console.log(`Phase:          ${state.position.phase}`);
  if (state.position.task) console.log(`Task:           ${state.position.task}`);
  if (state.lastSession)
    console.log(`Last Session:   ${state.lastSession.date} — ${state.lastSession.summary}`);
  printStateProgress(state.progress);
  if (state.decisions.length > 0) console.log(`\nDecisions: ${state.decisions.length}`);
  if (state.blockers.length > 0) {
    const open = state.blockers.filter((b) => b.status === 'open').length;
    console.log(`Blockers:   ${open} open / ${state.blockers.length} total`);
  }
}

function printStateProgress(progress: HarnessState['progress']): void {
  if (Object.keys(progress).length === 0) return;
  console.log('\nProgress:');
  for (const [task, status] of Object.entries(progress)) {
    console.log(`  ${task}: ${status}`);
  }
}

export function createShowCommand(): Command {
  return new Command('show')
    .description('Show current project state')
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const result = await loadState(path.resolve(opts.path), opts.stream);

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }

      const state = result.value;
      if (globalOpts.json) logger.raw(state);
      else if (globalOpts.quiet) console.log(JSON.stringify(state));
      else printStateText(state, opts.stream);

      process.exit(ExitCode.SUCCESS);
    });
}
