import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

/**
 * Wire the HUD into `~/.claude/settings.json`, replacing the standalone
 * `claude-burn-hud` install.
 *
 * Deliberately additive and reversible: the file is backed up first, unrelated
 * hooks survive, and only entries that point at this HUD (old or new) are
 * touched. The old Python install stays on disk afterwards — a HUD that
 * silently deletes its own predecessor leaves no way back if the replacement
 * misreports.
 */

/** Absolute path to the hot-path binary shipped by @harness-engineering/burn. */
export function resolveHudBinary(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@harness-engineering/burn');
  return path.join(path.dirname(entry), 'bin', 'burn-hud.mjs');
}

interface HookEntry {
  hooks?: { type?: string; command?: string }[];
}

/**
 * True for a hook/statusline command belonging to either HUD generation.
 *
 * These are substrings of a shell command already written into settings.json,
 * not paths being constructed — the separator is whatever the user's shell
 * recorded, so `path.join` has nothing to contribute here.
 */
function isBurnHudCommand(command: string | undefined): boolean {
  if (!command) return false;
  return (
    // Matches both the bin name (`harness-burn-hud`) and the path it resolves
    // to (`.../bin/burn-hud.mjs`). Matching only the bin name meant a repeat
    // install did not recognise its own entry and stacked a second Stop hook
    // on every run.
    command.includes('burn-hud') ||
    // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- matching a recorded command string, not building a path
    command.includes('.claude/hud/') ||
    command.includes('claude-burn')
  );
}

export interface InstallPlan {
  statusLine: string;
  replaced: string[];
  added: string[];
  /** A statusline belonging to something else, which installing will take over. */
  clobbered: string | null;
}

/**
 * Describe exactly what `install` will do, so the printed plan and the write
 * cannot disagree. A statusline is single-valued: installing one necessarily
 * takes it over, so an unrelated existing command is reported as a clobber
 * rather than quietly overwritten.
 */
export function buildPlan(settings: Record<string, unknown>, binary: string): InstallPlan {
  const replaced: string[] = [];
  const added: string[] = [];
  let clobbered: string | null = null;

  const existingStatus = (settings.statusLine ?? {}) as { command?: string };
  if (isBurnHudCommand(existingStatus.command)) {
    replaced.push(`statusLine: ${existingStatus.command}`);
  } else if (existingStatus.command) {
    clobbered = existingStatus.command;
  } else {
    added.push('statusLine');
  }

  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  for (const event of ['SessionStart', 'Stop']) {
    const entries = hooks[event] ?? [];
    const mine = entries.flatMap((e) => (e.hooks ?? []).filter((h) => isBurnHudCommand(h.command)));
    if (mine.length) replaced.push(`${event}: ${mine.map((h) => h.command).join(', ')}`);
    else added.push(event);
  }

  return { statusLine: `${binary} line`, replaced, added, clobbered };
}

/**
 * Return `settings` with this HUD wired in.
 *
 * Pure and idempotent: every burn-HUD entry (this generation or the previous
 * one) is dropped first and exactly one fresh entry appended, so running the
 * install twice leaves one hook rather than two firing on every turn.
 */
export function applySettings(
  settings: Record<string, unknown>,
  binary: string
): Record<string, unknown> {
  const updated: Record<string, unknown> = { ...settings };
  updated.statusLine = { type: 'command', command: `${binary} line` };

  const existing = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
  const hooks: Record<string, HookEntry[]> = { ...existing };
  for (const [event, sub] of [
    ['SessionStart', 'session-start'],
    ['Stop', 'stop'],
  ] as const) {
    const kept = (existing[event] ?? [])
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks ?? []).filter((h) => !isBurnHudCommand(h.command)),
      }))
      .filter((entry) => (entry.hooks ?? []).length > 0);
    kept.push({ hooks: [{ type: 'command', command: `${binary} ${sub}` }] });
    hooks[event] = kept;
  }
  updated.hooks = hooks;
  return updated;
}

export function install(dryRun: boolean): number {
  const binary = resolveHudBinary();
  if (!existsSync(binary)) {
    console.log(chalk.red(`HUD binary not found at ${binary}`));
    console.log(chalk.dim('Run `pnpm build` (from a source checkout) or reinstall the CLI.'));
    return 1;
  }

  const settingsPath = path.join(homedir(), '.claude', 'settings.json');
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    } catch {
      // Refuse rather than overwrite: this file holds the user's whole Claude
      // Code configuration, and a parse failure here means we cannot merge
      // safely, not that there is nothing to preserve.
      console.log(chalk.red(`${settingsPath} is not valid JSON — fix it before installing.`));
      return 1;
    }
  }

  const plan = buildPlan(settings, binary);
  console.log('');
  console.log(`  ${chalk.bold('burn HUD install')} ${chalk.dim(`→ ${settingsPath}`)}`);
  console.log(`  ${chalk.dim('binary:')} ${binary}`);
  for (const r of plan.replaced) console.log(`  ${chalk.yellow('replace')} ${r}`);
  for (const a of plan.added) console.log(`  ${chalk.green('add')}     ${a}`);
  if (plan.clobbered) {
    console.log(
      `  ${chalk.red('TAKE OVER')} statusLine currently runs something else: ${plan.clobbered}`
    );
    console.log(
      chalk.dim('            a statusline is single-valued; the old command is kept in the backup.')
    );
  }
  if (dryRun) {
    console.log('');
    console.log(chalk.dim('  --dry-run: nothing written.'));
    return 0;
  }

  const updated = applySettings(settings, binary);

  const backupPath = `${settingsPath}.bak`;
  if (existsSync(settingsPath)) copyFileSync(settingsPath, backupPath);
  writeFileSync(settingsPath, JSON.stringify(updated, null, 2) + '\n');

  console.log('');
  console.log(chalk.green('  Installed.') + chalk.dim(` Backup: ${backupPath}`));
  console.log(chalk.dim('  Restart Claude Code to pick up the statusline.'));
  console.log(
    chalk.dim('  The previous ~/.claude/hud install is untouched — remove it once satisfied.')
  );
  console.log('');
  return 0;
}

export function createInstallCommand(): Command {
  return new Command('install')
    .description('Wire the burn HUD statusline and hooks into ~/.claude/settings.json')
    .option('--dry-run', 'show what would change without writing')
    .action((opts: { dryRun?: boolean }) => {
      process.exitCode = install(opts.dryRun === true);
    });
}
