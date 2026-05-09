// packages/cli/src/commands/sync-main.ts
import { Command } from 'commander';
import * as path from 'node:path';
import {
  syncMain as defaultSyncMain,
  type SyncMainResult,
} from '@harness-engineering/orchestrator';
import { ExitCode } from '../utils/errors';

export interface RunSyncMainOptions {
  cwd?: string;
  json?: boolean;
  /** Override for tests; defaults to the orchestrator's `syncMain`. */
  syncMainFn?: (repoRoot: string) => Promise<SyncMainResult>;
}

/**
 * Run the sync-main flow and return an exit code. Does not call
 * `process.exit` so callers can use it from tests.
 */
export async function runSyncMain(opts: RunSyncMainOptions): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const fn = opts.syncMainFn ?? ((root: string) => defaultSyncMain(root));
  const result = await fn(cwd);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${formatHuman(result)}\n`);
  }

  return result.status === 'error' ? ExitCode.ERROR : ExitCode.SUCCESS;
}

function formatHuman(r: SyncMainResult): string {
  switch (r.status) {
    case 'updated':
      return `updated ${r.defaultBranch}: ${r.from.slice(0, 7)} -> ${r.to.slice(0, 7)}`;
    case 'no-op':
      return `up-to-date: ${r.defaultBranch}`;
    case 'skipped':
      return `skipped (${r.reason}): ${r.detail}`;
    case 'error':
      return `error: ${r.message}`;
  }
}

export function createSyncMainCommand(): Command {
  return new Command('sync-main')
    .description('Fast-forward the local default branch from origin (no-op on conflict)')
    .option('--json', 'Emit a SyncMainResult JSON object', false)
    .option('--path <path>', 'Project root path', '.')
    .action(async (opts: { json?: boolean; path?: string }) => {
      const cwd = path.resolve(opts.path ?? '.');
      const exitCode = await runSyncMain({ cwd, json: Boolean(opts.json) });
      process.exit(exitCode);
    });
}
