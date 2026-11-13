import { Command } from 'commander';
import {
  isRaisingChange,
  sessionDirForRaise,
  writeSessionOverride,
  type AutonomySessionOverride,
  type AutonomySetting,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { confirmYesNo } from '../../output/prompt';
import type { AutonomyCliDeps } from './deps';

export interface AutonomySetOptions {
  session: string;
  audit?: string;
  /** Raise lifetime, e.g. 90m, 2h, 7d (D14). Default 24h. */
  for?: string;
}

type RefuseReason = 'not-a-tty' | 'declined' | 'invalid' | 'no-session';

export type AutonomySetOutcome =
  | { status: 'written'; override: AutonomySessionOverride }
  | { status: 'refused'; reason: RefuseReason; message: string };

const DEFAULT_RAISE_FOR = '24h';
const DURATION_UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** `<positive integer><m|h|d>` → milliseconds, or null when malformed. */
export function parseRaiseDuration(raw: string): number | null {
  const m = /^([1-9]\d*)([mhd])$/.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * DURATION_UNIT_MS[m[2] as keyof typeof DURATION_UNIT_MS];
}

export function defaultIsInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** EOF / a closed stdin resolves as declined (I5). */
function defaultConfirm(question: string): Promise<boolean> {
  return confirmYesNo(question);
}

function refuse(reason: RefuseReason, message: string): AutonomySetOutcome {
  return { status: 'refused', reason, message };
}

function parseChange(
  levelArg: string | undefined,
  auditArg: string | undefined
): AutonomySetting | string {
  if (levelArg === undefined && auditArg === undefined) {
    return 'give a level (supervised | trusted) and/or --audit on|off';
  }
  if (levelArg !== undefined && levelArg !== 'supervised' && levelArg !== 'trusted') {
    return `level must be supervised or trusted (got "${levelArg}")`;
  }
  if (auditArg !== undefined && auditArg !== 'on' && auditArg !== 'off') {
    return `--audit must be on or off (got "${auditArg}")`;
  }
  return {
    ...(levelArg !== undefined && { level: levelArg }),
    ...(auditArg !== undefined && { audit: auditArg === 'on' }),
  };
}

/** `level=trusted, audit=off` — the change as a human reads it in the confirm prompt. */
export function describeChange(change: AutonomySetting): string {
  return [
    ...(change.level !== undefined ? [`level=${change.level}`] : []),
    ...(change.audit !== undefined ? [`audit=${change.audit ? 'on' : 'off'}`] : []),
  ].join(', ');
}

/** Raising (trusted or audit off) requires an interactive TTY and an explicit yes (D12). */
export async function runAutonomySet(
  levelArg: string | undefined,
  opts: AutonomySetOptions,
  deps: AutonomyCliDeps = {}
): Promise<AutonomySetOutcome> {
  const change = parseChange(levelArg, opts.audit);
  if (typeof change === 'string') return refuse('invalid', change);
  const raising = isRaisingChange(change);
  const forArg = opts.for ?? DEFAULT_RAISE_FOR;
  const ttlMs = parseRaiseDuration(forArg);
  if (ttlMs === null) {
    return refuse(
      'invalid',
      `--for must be a positive duration like 90m, 2h or 7d (got "${forArg}")`
    );
  }
  if (!raising && opts.for !== undefined) {
    return refuse('invalid', '--for applies only to a raise; lowerings are permanent (D14).');
  }
  const cwd = (deps.cwd ?? (() => process.cwd()))();
  const pathOpts = { ...(deps.homeDir !== undefined && { homeDir: deps.homeDir }) };
  if (raising) {
    if (!(deps.isInteractive ?? defaultIsInteractive)()) {
      return refuse(
        'not-a-tty',
        'Raising autonomy requires an interactive terminal (stdin and stdout must be a TTY) and an ' +
          'explicit yes. Run this command yourself. The TTY check refuses scripts and ' +
          'non-interactive agent sessions; it is not a sandbox against a process that can drive a terminal.'
      );
    }
    // D14: bound to a live session dir. Checked before prompting so the human is never asked
    // to confirm a raise that would then be refused.
    const dir = sessionDirForRaise(cwd, opts.session, pathOpts);
    if (!dir.ok) return refuse('no-session', dir.error.message);
    const ok = await (deps.confirm ?? defaultConfirm)(
      `Raise autonomy for session "${opts.session}" to ${describeChange(change)} for ${forArg}? ` +
        'Workflow skills will auto-approve ceremony pauses and auto-take audited recommendations. (y/N) '
    );
    if (!ok) return refuse('declined', 'Aborted; override unchanged.');
  }
  const written = writeSessionOverride(cwd, opts.session, change, 'cli', {
    ...pathOpts,
    ...(deps.now !== undefined && { now: deps.now }),
    raiseTtlMs: ttlMs,
  });
  if (!written.ok) return refuse('invalid', written.error.message);
  return { status: 'written', override: written.value };
}

export function createAutonomySetCommand(deps: AutonomyCliDeps = {}): Command {
  return new Command('set')
    .description('Set the session autonomy override (raising requires an interactive terminal)')
    .argument('[level]', 'supervised | trusted (omit to change only --audit)')
    .requiredOption('--session <slug>', 'Session slug to override')
    .option('--audit <on|off>', 'Self-audit on judgment forks')
    .option('--for <duration>', 'How long a raise lasts, e.g. 90m, 2h, 7d (default 24h)')
    .action(async (level: string | undefined, opts: AutonomySetOptions) => {
      const out = await runAutonomySet(level, opts, deps);
      if (out.status === 'written') {
        logger.success(`Autonomy override for session "${opts.session}" saved.`);
        return;
      }
      logger.error(out.message);
      process.exitCode = 1;
    });
}
