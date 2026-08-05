import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

/**
 * Adopter-facing installer for the roadmap aggregate-regeneration git hook.
 *
 * This repo keeps `docs/roadmap.md` (a generated `merge=ours` aggregate) fresh
 * with a `.husky/pre-commit` step that runs `harness roadmap regen` whenever a
 * `docs/roadmap.d/` shard is staged. Adopters who shard their roadmap want the
 * same drift-prevention, but harness installs no git hooks for them today — the
 * portable freshness contract is the CI aggregate-drift check (`harness
 * validate`). This command adds the missing *local* convenience: it wires the
 * regen step into an adopter's `pre-commit` hook, composing safely with an
 * existing husky or raw `.git/hooks` setup.
 *
 * It is intentionally a GIT hook, not a Claude Code agent hook (`harness hooks
 * init` / profiles.ts register tool-use hooks, which cannot fire on `git
 * commit`).
 */

/** Fence markers delimiting the managed block, so re-runs replace (never duplicate) it. */
export const HOOK_BLOCK_BEGIN =
  '# >>> harness roadmap regen (managed by `harness roadmap install-hook`) >>>';
export const HOOK_BLOCK_END =
  '# <<< harness roadmap regen (managed by `harness roadmap install-hook`) <<<';

/** Default regen invocation written into an adopter hook (resolves the local CLI bin). */
export const DEFAULT_REGEN_COMMAND = 'npx harness roadmap regen';

export type HookMechanism = 'husky' | 'git';
export type InstallHookAction = 'created' | 'updated' | 'unchanged' | 'skipped';

export interface RoadmapInstallHookOptions {
  /** Project root (defaults to the current working directory). */
  cwd?: string;
  /** Hook mechanism: `auto` picks husky when `.husky/` exists, otherwise raw `.git/hooks`. */
  mechanism?: 'auto' | HookMechanism;
  /** Shell command the hook runs to regenerate the aggregate. */
  command?: string;
  /** Install even when the project is not sharded (no `docs/roadmap.d/`). */
  force?: boolean;
  /** Output format: human-readable (default) or a single JSON object for CI. */
  format?: 'human' | 'json';
}

/** Summary of an install-hook run. */
export interface InstallHookReport {
  /** Which hook surface was written. */
  mechanism: HookMechanism;
  /** Absolute path to the hook file that was written (or would have been). */
  hookPath: string;
  /** What happened to the hook file. */
  action: InstallHookAction;
  /** Whether the project is sharded (`docs/roadmap.d/` present). */
  sharded: boolean;
  /** The regen command embedded in the hook block. */
  command: string;
}

/** Build the managed hook block (markers + guarded regen) for `regenCommand`. */
export function buildRegenBlock(regenCommand: string): string {
  return [
    HOOK_BLOCK_BEGIN,
    '# Regenerate docs/roadmap.md from the docs/roadmap.d/ shards when a shard is',
    '# staged, so the committed aggregate never drifts. Safe no-op when no shard is',
    '# staged. Managed by `harness roadmap install-hook` — edits inside this block',
    '# are overwritten on the next run.',
    "if git diff --cached --name-only | grep -qE '^docs/roadmap\\.d/'; then",
    `  if ! ${regenCommand}; then`,
    `    echo "Commit blocked: '${regenCommand}' failed; refusing to commit a stale docs/roadmap.md" >&2`,
    '    exit 1',
    '  fi',
    '  git add docs/roadmap.md',
    'fi',
    HOOK_BLOCK_END,
  ].join('\n');
}

/**
 * Idempotently merge `block` into an existing hook file's `existing` content.
 *
 * - No file yet (`existing === null`) or an effectively-empty file: create a
 *   fresh POSIX hook (shebang + block).
 * - A previously managed block (markers present): replace it in place, keeping
 *   everything around it untouched. Identical content reports `unchanged`.
 * - An adopter hook with no managed block: append the block, never clobbering
 *   the adopter's own steps.
 */
export function mergeHookContent(
  existing: string | null,
  block: string
): { content: string; action: InstallHookAction } {
  if (existing === null || existing.trim() === '') {
    return { content: `#!/bin/sh\n${block}\n`, action: 'created' };
  }

  const begin = existing.indexOf(HOOK_BLOCK_BEGIN);
  if (begin !== -1) {
    const endMarker = existing.indexOf(HOOK_BLOCK_END);
    // Guard against a truncated/corrupted block missing its END marker: fall
    // back to appending a fresh block rather than mangling the file.
    if (endMarker !== -1 && endMarker >= begin) {
      const endLineBreak = existing.indexOf('\n', endMarker);
      const head = existing.slice(0, begin);
      const tail = endLineBreak === -1 ? '' : existing.slice(endLineBreak);
      const content = `${head}${block}${tail}`;
      return { content, action: content === existing ? 'unchanged' : 'updated' };
    }
  }

  const separator = existing.endsWith('\n') ? '' : '\n';
  return { content: `${existing}${separator}\n${block}\n`, action: 'updated' };
}

/**
 * Resolve the directory git uses for hooks in `cwd`. Prefers `git rev-parse
 * --git-path hooks` so it is correct in linked worktrees and submodules (where
 * `.git` is a file, not a directory); falls back to `<cwd>/.git/hooks`.
 */
function resolveGitHooksDir(cwd: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      cwd,
      encoding: 'utf-8',
    }).trim();
    return path.isAbsolute(out) ? out : path.join(cwd, out);
  } catch {
    return path.join(cwd, '.git', 'hooks');
  }
}

/** True if `cwd` looks like a git repository (`.git` present as dir or gitdir file). */
function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

/**
 * Install (or refresh) the roadmap-regen pre-commit hook. Idempotent: re-running
 * replaces the managed block in place and reports `unchanged` when nothing moved.
 * Degrades gracefully when the project is not sharded (skips unless `--force`).
 */
export async function runRoadmapInstallHook(
  opts: RoadmapInstallHookOptions = {}
): Promise<Result<InstallHookReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const command = opts.command?.trim() || DEFAULT_REGEN_COMMAND;
  const requested = opts.mechanism ?? 'auto';
  const force = Boolean(opts.force);

  if (!isGitRepo(cwd)) {
    return Err(
      new CLIError(
        'Not a git repository (no .git found); cannot install a git hook.',
        ExitCode.ERROR
      )
    );
  }

  const sharded = fs.existsSync(path.join(cwd, 'docs', 'roadmap.d'));

  // Resolve the mechanism. `auto` prefers husky when the adopter already uses it.
  const huskyDir = path.join(cwd, '.husky');
  const mechanism: HookMechanism =
    requested === 'auto' ? (fs.existsSync(huskyDir) ? 'husky' : 'git') : requested;

  const hookPath =
    mechanism === 'husky'
      ? path.join(huskyDir, 'pre-commit')
      : path.join(resolveGitHooksDir(cwd), 'pre-commit');

  // Graceful degradation: nothing to protect until the roadmap is sharded.
  // `--force` still installs (useful to pre-provision before `harness roadmap shard`).
  if (!sharded && !force) {
    return Ok({ mechanism, hookPath, action: 'skipped', sharded, command });
  }

  const existing = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf-8') : null;
  const block = buildRegenBlock(command);
  const { content, action } = mergeHookContent(existing, block);

  if (action !== 'unchanged') {
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, content);
  }
  // A raw `.git/hooks` hook must be executable; husky sources its files but the
  // execute bit is harmless there. chmod every run so a pre-existing non-exec
  // hook is fixed too. Guarded: chmod is a POSIX-mode no-op on Windows (git for
  // Windows honors the hook regardless), and best-effort so a filesystem without
  // POSIX modes must not fail.
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(hookPath, 0o755);
    } catch {
      // Non-POSIX filesystem — nothing to do.
    }
  }

  return Ok({ mechanism, hookPath, action, sharded, command });
}

/** Print the human-readable summary of an install-hook run. */
function printReport(report: InstallHookReport, cwd: string): void {
  const rel = path.relative(cwd, report.hookPath).replaceAll('\\', '/');

  if (report.action === 'skipped') {
    logger.warn(
      `Project is not sharded (docs/roadmap.d not found) — skipped hook install. ` +
        `Run 'harness roadmap shard' first, or re-run with --force to pre-provision.`
    );
    return;
  }

  const verb =
    report.action === 'created'
      ? 'Created'
      : report.action === 'updated'
        ? 'Updated'
        : 'Already up to date:';
  logger.success(`${verb} ${report.mechanism} pre-commit hook at ${rel}`);
  logger.info(`Hook runs: ${report.command}`);
  if (!report.sharded) {
    logger.warn('Project is not sharded yet — the hook is a no-op until docs/roadmap.d/ exists.');
  }
}

/** Emit an error in the requested format (JSON object or human log) and exit. */
function failInstallHook(message: string, format: 'human' | 'json', exitCode: number): never {
  if (format === 'json') {
    console.log(JSON.stringify({ ok: false, error: message }));
  } else {
    logger.error(message);
  }
  process.exit(exitCode);
}

interface InstallHookCliOptions {
  cwd?: string;
  mechanism?: string;
  command?: string;
  force?: boolean;
  format?: string;
}

/** The `harness roadmap install-hook` action body, extracted for clarity + testability. */
export async function runInstallHookAction(options: InstallHookCliOptions): Promise<void> {
  const format: 'human' | 'json' = options.format === 'json' ? 'json' : 'human';
  const mechanism = options.mechanism ?? 'auto';

  if (!['auto', 'husky', 'git'].includes(mechanism)) {
    failInstallHook(
      `Invalid --mechanism: ${mechanism}. Must be one of: auto, husky, git`,
      format,
      ExitCode.ERROR
    );
  }

  const cwd = options.cwd ?? process.cwd();
  const result = await runRoadmapInstallHook({
    cwd,
    mechanism: mechanism as 'auto' | HookMechanism,
    ...(options.command ? { command: options.command } : {}),
    force: Boolean(options.force),
    format,
  });

  if (!result.ok) {
    failInstallHook(result.error.message, format, result.error.exitCode);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ ok: true, ...result.value }));
  } else {
    printReport(result.value, cwd);
  }
}

/** Commander wrapper for `harness roadmap install-hook`. */
export function createRoadmapInstallHookCommand(): Command {
  return new Command('install-hook')
    .description(
      'Install a git pre-commit hook that regenerates docs/roadmap.md from the docs/roadmap.d shards'
    )
    .option('--cwd <dir>', 'Project root (defaults to the current working directory)')
    .option(
      '--mechanism <mechanism>',
      'Hook mechanism: "auto" (default), "husky", or "git" (raw .git/hooks)',
      'auto'
    )
    .option('--command <command>', 'Regen command the hook runs', DEFAULT_REGEN_COMMAND)
    .option('--force', 'Install even when the project is not sharded (no docs/roadmap.d)', false)
    .option(
      '--format <fmt>',
      'Output format: "human" (default) or "json" (single JSON object for CI consumers)',
      'human'
    )
    .action(runInstallHookAction);
}
