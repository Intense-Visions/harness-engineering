import { Command } from 'commander';
import * as path from 'path';
import {
  createStream,
  listStreams,
  archiveStream,
  setActiveStream,
  loadStreamIndex,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

export function createStreamsCommand(): Command {
  const command = new Command('streams').description('Manage state streams');

  command
    .command('list')
    .description('List all known streams')
    .option('--path <path>', 'Project root path', '.')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectPath = path.resolve(opts.path);
      const indexResult = await loadStreamIndex(projectPath);
      const result = await listStreams(projectPath);
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }
      const active = indexResult.ok ? indexResult.value.activeStream : null;
      if (globalOpts.json) {
        logger.raw({ activeStream: active, streams: result.value });
      } else {
        if (result.value.length === 0) {
          console.log('No streams found.');
        }
        for (const s of result.value) {
          const marker = s.name === active ? ' (active)' : '';
          const branch = s.branch ? ` [${s.branch}]` : '';
          console.log(`  ${s.name}${marker}${branch} — last active: ${s.lastActiveAt}`);
        }
      }
      process.exit(ExitCode.SUCCESS);
    });

  command
    .command('create <name>')
    .description('Create a new stream')
    .option('--path <path>', 'Project root path', '.')
    .option('--branch <branch>', 'Associate with a git branch')
    .action(async (name, opts) => {
      const projectPath = path.resolve(opts.path);
      const result = await createStream(projectPath, name, opts.branch);
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }
      logger.success(`Stream '${name}' created.`);
      process.exit(ExitCode.SUCCESS);
    });

  command
    .command('archive <name>')
    .description('Archive a stream')
    .option('--path <path>', 'Project root path', '.')
    .action(async (name, opts) => {
      const projectPath = path.resolve(opts.path);
      const result = await archiveStream(projectPath, name);
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }
      logger.success(`Stream '${name}' archived.`);
      process.exit(ExitCode.SUCCESS);
    });

  command
    .command('activate <name>')
    .description('Set the active stream')
    .option('--path <path>', 'Project root path', '.')
    .action(async (name, opts) => {
      const projectPath = path.resolve(opts.path);
      const result = await setActiveStream(projectPath, name);
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
        return;
      }
      logger.success(`Active stream set to '${name}'.`);
      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
