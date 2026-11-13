import { Command } from 'commander';
import {
  isRaisingChange,
  writeSessionOverride,
  type AutonomySessionOverride,
  type AutonomySetting,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { prompt } from '../../output/prompt';
import type { AutonomyCliDeps } from './deps';

export interface AutonomySetOptions {
  session: string;
  audit?: string;
}

export type AutonomySetOutcome =
  | { status: 'written'; override: AutonomySessionOverride }
  | { status: 'refused'; reason: 'not-a-tty' | 'declined' | 'invalid'; message: string };

export function defaultIsInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function defaultConfirm(question: string): Promise<boolean> {
  const answer = await prompt(question);
  return answer === 'y' || answer === 'yes';
}

function refuse(reason: 'not-a-tty' | 'declined' | 'invalid', message: string): AutonomySetOutcome {
  return { status: 'refused', reason, message };
}

function parseChange(levelArg: string, auditArg: string | undefined): AutonomySetting | string {
  if (levelArg !== 'supervised' && levelArg !== 'trusted') {
    return `level must be supervised or trusted (got "${levelArg}")`;
  }
  if (auditArg !== undefined && auditArg !== 'on' && auditArg !== 'off') {
    return `--audit must be on or off (got "${auditArg}")`;
  }
  return {
    level: levelArg,
    ...(auditArg !== undefined && { audit: auditArg === 'on' }),
  };
}

/** Raising (trusted or audit off) requires an interactive TTY and an explicit yes (D12). */
export async function runAutonomySet(
  levelArg: string,
  opts: AutonomySetOptions,
  deps: AutonomyCliDeps = {}
): Promise<AutonomySetOutcome> {
  const change = parseChange(levelArg, opts.audit);
  if (typeof change === 'string') return refuse('invalid', change);
  if (isRaisingChange(change)) {
    if (!(deps.isInteractive ?? defaultIsInteractive)()) {
      return refuse(
        'not-a-tty',
        'Raising autonomy requires an interactive terminal (stdin and stdout must be a TTY). Run this command yourself; an agent cannot raise autonomy.'
      );
    }
    const ok = await (deps.confirm ?? defaultConfirm)(
      `Raise autonomy for session "${opts.session}" to ${JSON.stringify(change)}? ` +
        'Workflow skills will auto-approve ceremony pauses and auto-take audited recommendations. (y/N) '
    );
    if (!ok) return refuse('declined', 'Aborted; override unchanged.');
  }
  const written = writeSessionOverride(
    (deps.cwd ?? (() => process.cwd()))(),
    opts.session,
    change,
    'cli',
    {
      ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }),
      ...(deps.now !== undefined && { now: deps.now }),
    }
  );
  if (!written.ok) return refuse('invalid', written.error.message);
  return { status: 'written', override: written.value };
}

export function createAutonomySetCommand(deps: AutonomyCliDeps = {}): Command {
  return new Command('set')
    .description('Set the session autonomy override (raising requires an interactive terminal)')
    .argument('<level>', 'supervised | trusted')
    .requiredOption('--session <slug>', 'Session slug to override')
    .option('--audit <on|off>', 'Self-audit on judgment forks')
    .action(async (level: string, opts: AutonomySetOptions) => {
      const out = await runAutonomySet(level, opts, deps);
      if (out.status === 'written') {
        logger.success(`Autonomy override for session "${opts.session}" saved.`);
        return;
      }
      logger.error(out.message);
      process.exitCode = 1;
    });
}
