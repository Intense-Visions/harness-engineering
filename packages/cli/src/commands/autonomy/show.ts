import { Command } from 'commander';
import { resolveAutonomyForSession, type ResolvedAutonomy } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import type { AutonomyCliDeps } from './deps';

export function runAutonomyShow(
  opts: { session?: string },
  deps: AutonomyCliDeps = {}
): ResolvedAutonomy {
  return resolveAutonomyForSession({
    projectPath: (deps.cwd ?? (() => process.cwd()))(),
    ...(opts.session !== undefined && { session: opts.session }),
    env: deps.env ?? process.env,
    ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
  });
}

export function formatAutonomy(r: ResolvedAutonomy): string[] {
  return [
    `level: ${r.level} (source: ${r.source.level})`,
    `audit: ${r.audit ? 'on' : 'off'} (source: ${r.source.audit})`,
    ...r.warnings.map((w) => `warning: ${w}`),
  ];
}

export function createAutonomyShowCommand(deps: AutonomyCliDeps = {}): Command {
  return new Command('show')
    .description('Show the resolved autonomy level and audit setting, and the source of each')
    .option('--session <slug>', 'Include this session’s override')
    .action((opts: { session?: string }, cmd: Command) => {
      const resolved = runAutonomyShow(opts, deps);
      if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
        console.log(JSON.stringify(resolved, null, 2));
        return;
      }
      for (const line of formatAutonomy(resolved)) logger.info(line);
    });
}
