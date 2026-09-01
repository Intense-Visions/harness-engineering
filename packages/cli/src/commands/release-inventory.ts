import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/core';
import {
  Ok,
  computeReleaseInventory,
  evaluateReleaseInventory,
  DEFAULT_RELEASE_INVENTORY_THRESHOLDS,
  type ReleaseChannel,
  type ReleaseInventoryFsPort,
  type ReleaseInventoryGitPort,
  type ReleaseInventoryResult,
  type ReleaseInventoryThresholds,
  type ReleaseTag,
  type UnreleasedCommit,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputMode } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

/**
 * `harness release-inventory` — report the merged-but-unreleased inventory:
 * changes merged into the mainline but not yet in a published release (issue
 * #1526). Report-only: exits 0 by default, exits non-zero on breach only under
 * `--strict`. The pure engine lives in `@harness-engineering/core`
 * (`release-inventory/`); this command is the node git + fs adapter and renderer.
 */

/**
 * Injectable git seam. Returns trimmed stdout of `git <args>`; throws on
 * non-zero exit. Real implementation uses `execFileSync` (no shell) so tests can
 * stub it and callers cannot inject shell metacharacters.
 */
export type RunGit = (args: string[]) => string;

const makeDefaultRunGit =
  (cwd: string): RunGit =>
  (args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // Whole-history `git log HEAD` on a zero-release repo (the unbounded case)
      // easily exceeds the 1MB default; a truncated read would throw and be
      // swallowed to an empty (falsely-zero) inventory. Give it ample room.
      maxBuffer: 256 * 1024 * 1024,
    })
      .toString()
      .trim();

const FIELD_SEP = '	'; // tab — safe field separator for git --format

/** Split trimmed non-empty lines from raw git stdout. */
function nonEmptyLines(out: string): string[] {
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Run a git command through the seam, returning '' on any failure. */
function runGitSafe(runGit: RunGit, args: string[]): string {
  try {
    return runGit(args);
  } catch {
    return '';
  }
}

/** Parse one tag line (`name<TAB>date`) into a {@link ReleaseTag}. */
function parseTagLine(line: string): ReleaseTag {
  const [name, date] = line.split(FIELD_SEP);
  return { name: name ?? line, date: date || null };
}

/** Parse one log line (`sha<TAB>date<TAB>parents<TAB>subject`) into a commit. */
function parseCommitLine(line: string): UnreleasedCommit {
  const [sha, date, parents, ...rest] = line.split(FIELD_SEP);
  const trimmedParents = (parents ?? '').trim();
  const parentCount = trimmedParents ? trimmedParents.split(/\s+/).length : 0;
  return {
    sha: sha ?? '',
    date: date || null,
    isMerge: parentCount >= 2,
    subject: rest.join(FIELD_SEP),
  };
}

/** Tags matching `pattern`, newest first; [] on error. */
function gitListReleaseTags(runGit: RunGit, pattern: string): ReleaseTag[] {
  const out = runGitSafe(runGit, [
    'tag',
    '--list',
    pattern,
    '--sort=-creatordate',
    `--format=%(refname:short)${FIELD_SEP}%(creatordate:iso-strict)`,
  ]);
  return out ? nonEmptyLines(out).map(parseTagLine) : [];
}

/** Commits in `sinceTag..HEAD` (whole history when null), newest first; [] on error. */
function gitCommitsSince(runGit: RunGit, sinceTag: string | null): UnreleasedCommit[] {
  const range = sinceTag ? `${sinceTag}..HEAD` : 'HEAD';
  const out = runGitSafe(runGit, [
    'log',
    range,
    `--format=%H${FIELD_SEP}%cI${FIELD_SEP}%P${FIELD_SEP}%s`,
  ]);
  return out ? nonEmptyLines(out).map(parseCommitLine) : [];
}

/** ISO date a file first entered history (oldest add), or null. */
function gitFileAddedDate(runGit: RunGit, relPath: string): string | null {
  const out = runGitSafe(runGit, [
    'log',
    '--diff-filter=A',
    '--follow',
    '--format=%cI',
    '--',
    relPath,
  ]);
  if (!out) return null;
  // git log is newest-first; the add commit (oldest) is the last line.
  const lines = nonEmptyLines(out);
  return lines.length > 0 ? (lines[lines.length - 1] ?? null) : null;
}

/** Build a {@link ReleaseInventoryGitPort} over a RunGit seam. */
export function createGitPort(runGit: RunGit): ReleaseInventoryGitPort {
  return {
    listReleaseTags: (pattern) => gitListReleaseTags(runGit, pattern),
    commitsSince: (sinceTag) => gitCommitsSince(runGit, sinceTag),
    fileAddedDate: (relPath) => gitFileAddedDate(runGit, relPath),
  };
}

/** Build a {@link ReleaseInventoryFsPort} rooted at `cwd`. */
export function createFsPort(cwd: string): ReleaseInventoryFsPort {
  return {
    listDir(relPath: string): string[] {
      try {
        return readdirSync(path.join(cwd, relPath));
      } catch {
        return [];
      }
    },
    readFile(relPath: string): string | null {
      try {
        const full = path.join(cwd, relPath);
        return existsSync(full) ? readFileSync(full, 'utf-8') : null;
      } catch {
        return null;
      }
    },
  };
}

/** Optional config block for the release-inventory metric. */
interface ReleaseInventoryConfig {
  enabled?: boolean;
  tagPattern?: string;
  maxPendingChangesets?: number;
  maxAgeDays?: number;
  maxUnreleasedMerges?: number;
}

/** Layer the (optional) config block over the built-in default thresholds. */
function resolveThresholds(raw: ReleaseInventoryConfig | undefined): ReleaseInventoryThresholds {
  return {
    maxPendingChangesets:
      raw?.maxPendingChangesets ?? DEFAULT_RELEASE_INVENTORY_THRESHOLDS.maxPendingChangesets,
    maxAgeDays: raw?.maxAgeDays ?? DEFAULT_RELEASE_INVENTORY_THRESHOLDS.maxAgeDays,
    maxUnreleasedMerges:
      raw?.maxUnreleasedMerges ?? DEFAULT_RELEASE_INVENTORY_THRESHOLDS.maxUnreleasedMerges,
  };
}

export interface ReleaseInventoryOptions {
  cwd?: string;
  configPath?: string;
  tagPattern?: string;
  runGit?: RunGit;
  fsPort?: ReleaseInventoryFsPort;
  /** Injectable clock for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

/**
 * Compute + evaluate the release inventory. Pure orchestration around the core
 * engine; all IO is injectable for testing.
 */
export async function runReleaseInventory(
  options: ReleaseInventoryOptions
): Promise<Result<ReleaseInventoryResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? makeDefaultRunGit(cwd);
  const fsPort = options.fsPort ?? createFsPort(cwd);
  const now = options.now ?? new Date();

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) return configResult;
  const raw = (configResult.value as { releaseInventory?: ReleaseInventoryConfig })
    .releaseInventory;

  const pattern = options.tagPattern ?? raw?.tagPattern ?? 'v*';
  const channel: ReleaseChannel = { kind: 'git-tag', pattern };
  const thresholds = resolveThresholds(raw);

  const gitPort = createGitPort(runGit);
  const inventory = computeReleaseInventory(gitPort, fsPort, channel, now);
  const result = evaluateReleaseInventory(inventory, thresholds);
  return Ok(result);
}

const STATUS_BADGE: Record<ReleaseInventoryResult['status'], string> = {
  ok: '✓',
  unbounded: '∞',
  warn: '⚠',
};

/** Print the headline counts and the denominator. */
function printSummary(result: ReleaseInventoryResult): void {
  const inv = result.inventory;
  const lastRelease = inv.lastRelease
    ? `${inv.lastRelease.name} (${inv.lastRelease.date ?? 'undated'})`
    : 'none — zero-release repo (unbounded)';
  const changesetAge =
    inv.oldestChangesetAgeDays !== null ? ` (oldest ${inv.oldestChangesetAgeDays}d)` : '';
  const commitAge =
    inv.oldestUnreleasedAgeDays !== null ? `, oldest ${inv.oldestUnreleasedAgeDays}d` : '';

  console.log(`${STATUS_BADGE[result.status]} Merged-but-unreleased inventory`);
  console.log(`  Shipped means: ${inv.shippedDefinition} (denominator)`);
  console.log(`  Last release:  ${lastRelease}`);
  console.log(`  Pending changesets:  ${inv.pendingChangesetCount}${changesetAge}`);
  console.log(
    `  Unreleased commits:  ${inv.unreleasedCommitCount} (${inv.unreleasedMergeCount} merges)${commitAge}`
  );
}

/** Print the pending-changeset file list, capped at 20. */
function printChangesetList(result: ReleaseInventoryResult): void {
  const list = result.inventory.pendingChangesets;
  if (list.length === 0) return;
  console.log('\n  Pending changeset files:');
  for (const c of list.slice(0, 20)) {
    console.log(`    - ${c.file} (${c.ageDays !== null ? `${c.ageDays}d` : 'uncommitted'})`);
  }
  if (list.length > 20) console.log(`    … and ${list.length - 20} more`);
}

/** Print threshold breaches (or the all-clear / unbounded note). */
function printVerdict(result: ReleaseInventoryResult): void {
  if (result.breaches.length > 0) {
    console.log('\n  Threshold breaches:');
    for (const b of result.breaches) console.log(`    ⚠ ${b.detail}`);
  } else if (result.status === 'ok') {
    console.log('\n  ✓ Inventory is within release-cadence thresholds.');
  }
  if (result.status === 'unbounded') {
    console.log(
      '\n  ∞ No release boundary: inventory is unbounded until the first release is cut.'
    );
  }
}

/** Render a scannable human report of the inventory (SC4). */
function printResult(result: ReleaseInventoryResult): void {
  printSummary(result);
  printChangesetList(result);
  printVerdict(result);
}

export function createReleaseInventoryCommand(): Command {
  const command = new Command('release-inventory')
    .description(
      'Report merged-but-unreleased inventory (pending changesets + unreleased commits) and its release-cadence threshold'
    )
    .option('--tag-pattern <glob>', 'Git tag glob that defines a release (default: v* or config)')
    .option('--strict', 'Exit non-zero when a threshold is breached (default: report-only)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const result = await runReleaseInventory({
        configPath: globalOpts.config,
        tagPattern: opts.tagPattern,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        printResult(result.value);
      }

      // Report-only by default: a breach reports but still exits 0.
      // `--strict` promotes a breach to a non-zero exit for opt-in CI enforcement.
      const shouldFail = Boolean(opts.strict) && result.value.breached;
      process.exit(shouldFail ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
    });

  return command;
}
