import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputMode } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import {
  DEFAULT_OPERATIONAL_DRIFT_POLICY,
  changedThresholdPaths,
  detectOperationalDrift,
  normalizeRel,
  type OperationalDriftFinding,
  type OperationalDriftPolicy,
  type OperationalDriftSeverity,
} from './operational-drift';

/**
 * Injectable git seam. Returns trimmed stdout of `git <args>`; throws on
 * non-zero exit. Real implementation uses `execFileSync` (no shell) so tests can
 * stub it without spawning a process and callers cannot inject shell metachars.
 */
export type RunGit = (args: string[]) => string;

const defaultRunGit: RunGit = (args) =>
  execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    .toString()
    .trim();

/**
 * Resolve the base ref to diff against.
 * - Explicit `--base <ref>` wins.
 * - Otherwise the default branch is read from `origin/HEAD`
 *   (`git symbolic-ref refs/remotes/origin/HEAD`), defaulting to `main`, and the
 *   base is the merge-base of HEAD and that branch — the same PR-diff semantics
 *   the other diff-based checks use.
 * - If merge-base resolution fails (shallow/CI checkout), fall back to the branch
 *   ref itself, then to `HEAD` (an empty diff — nothing to flag).
 */
export function resolveBaseRef(opts: { base?: string | undefined; runGit: RunGit }): string {
  if (opts.base) return opts.base;
  const { runGit } = opts;
  let branch = 'main';
  try {
    const ref = runGit(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const m = ref.match(/origin\/(.+)$/);
    if (m?.[1]) branch = m[1];
  } catch {
    // No origin/HEAD symbolic ref — keep the `main` default.
  }
  const candidates = [`origin/${branch}`, branch];
  for (const candidate of candidates) {
    try {
      return runGit(['merge-base', 'HEAD', candidate]);
    } catch {
      // Try the next candidate ref.
    }
  }
  return 'HEAD';
}

/**
 * Union of tracked changes (base → working tree) and untracked files, so the
 * check works both in CI (committed PR diff) and locally (staged/unstaged/new
 * files) — an ADR staged alongside an operational change is seen either way.
 */
export function collectChangedFiles(base: string, runGit: RunGit): string[] {
  const set = new Set<string>();
  try {
    for (const f of runGit(['diff', '--name-only', base]).split('\n')) {
      if (f.trim()) set.add(normalizeRel(f.trim()));
    }
  } catch {
    // No diff available (e.g. base === HEAD or bad ref) — leave set as-is.
  }
  try {
    for (const f of runGit(['ls-files', '--others', '--exclude-standard']).split('\n')) {
      if (f.trim()) set.add(normalizeRel(f.trim()));
    }
  } catch {
    // Untracked enumeration is best-effort.
  }
  return [...set];
}

/** Read and JSON-parse a file's contents at a git ref; `undefined` on any failure. */
function readJsonAtRef(ref: string, relPath: string, runGit: RunGit): unknown {
  try {
    const raw = runGit(['show', `${ref}:${relPath}`]);
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Read and JSON-parse a working-tree file; `undefined` on any failure. */
function readJsonFromDisk(cwd: string, relPath: string): unknown {
  try {
    const full = path.resolve(cwd, relPath);
    if (!existsSync(full)) return undefined;
    return JSON.parse(readFileSync(full, 'utf-8'));
  } catch {
    return undefined;
  }
}

export interface CheckOperationalDriftOptions {
  cwd?: string;
  configPath?: string;
  base?: string;
  /** Force blocking severity regardless of config (equivalent to `severity: 'blocking'`). */
  strict?: boolean;
  runGit?: RunGit;
}

export interface CheckOperationalDriftResult {
  /** true = no operational change, OR an operational change accompanied by an ADR. */
  valid: boolean;
  /** true = operational change with no corresponding ADR (the drift condition). */
  flagged: boolean;
  severity: OperationalDriftSeverity;
  base: string;
  operationalChanges: OperationalDriftFinding[];
  adrFiles: string[];
}

/**
 * Resolve the effective policy by layering the (optional) `operationalPolicy`
 * config block over the built-in defaults.
 */
function resolvePolicy(
  raw: Partial<OperationalDriftPolicy> | undefined,
  strictFlag: boolean | undefined
): OperationalDriftPolicy {
  const merged: OperationalDriftPolicy = {
    ...DEFAULT_OPERATIONAL_DRIFT_POLICY,
    ...(raw ?? {}),
  };
  if (strictFlag) merged.severity = 'blocking';
  return merged;
}

export async function runCheckOperationalDrift(
  options: CheckOperationalDriftOptions
): Promise<Result<CheckOperationalDriftResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? defaultRunGit;

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) return configResult;
  const rawPolicy = (configResult.value as { operationalPolicy?: Partial<OperationalDriftPolicy> })
    .operationalPolicy;
  const policy = resolvePolicy(rawPolicy, options.strict);

  const base = resolveBaseRef({ base: options.base, runGit });

  if (!policy.enabled) {
    return Ok({
      valid: true,
      flagged: false,
      severity: policy.severity,
      base,
      operationalChanges: [],
      adrFiles: [],
    });
  }

  const changedFiles = collectChangedFiles(base, runGit);

  // Field-level threshold diff for the config file, only if it actually changed.
  const configFile = normalizeRel(policy.configFile);
  const configChanged = changedFiles.includes(configFile);
  let changedConfigPaths: string[] = [];
  let configUndiffable = false;
  if (configChanged) {
    const baseConfig = readJsonAtRef(base, policy.configFile, runGit);
    const headConfig = readJsonFromDisk(cwd, policy.configFile);
    if (baseConfig === undefined || headConfig === undefined) {
      // Could not read one side — fall back to flagging the whole file.
      configUndiffable = true;
    } else {
      changedConfigPaths = changedThresholdPaths(
        baseConfig,
        headConfig,
        policy.configThresholdPaths
      );
    }
  }

  const detection = detectOperationalDrift({
    changedFiles,
    policy,
    changedConfigPaths,
    configUndiffable,
  });

  return Ok({
    valid: !detection.flagged,
    flagged: detection.flagged,
    severity: policy.severity,
    base,
    operationalChanges: detection.operationalChanges,
    adrFiles: detection.adrFiles,
  });
}

function printResult(result: CheckOperationalDriftResult): void {
  if (result.operationalChanges.length === 0) {
    console.log('✓ No operational-policy surfaces changed against ' + result.base);
    return;
  }

  console.log(`Operational-policy surfaces changed against ${result.base}:`);
  for (const finding of result.operationalChanges) {
    console.log(`  - ${finding.surface}: ${finding.detail}`);
  }

  if (result.adrFiles.length > 0) {
    console.log('\nCorresponding ADR(s) found in the same diff:');
    for (const adr of result.adrFiles) {
      console.log(`  - ${adr}`);
    }
    console.log('\n✓ Operational change is documented by an ADR.');
    return;
  }

  const label = result.severity === 'blocking' ? '✗' : '⚠';
  console.log(
    `\n${label} No ADR found under docs/knowledge/decisions/ for these operational-policy changes.`
  );
  console.log(
    '  Operational policy (hook profiles, thresholds, the pre-commit --skip list, baseline\n' +
      '  policy) is load-bearing. Add an ADR recording this decision, e.g.:'
  );
  console.log('    docs/knowledge/decisions/NNNN-<slug>.md');
  if (result.severity === 'advisory') {
    console.log(
      '\n  (advisory — not blocking; set operationalPolicy.severity=blocking to enforce)'
    );
  }
}

export function createCheckOperationalDriftCommand(): Command {
  const command = new Command('check-operational-drift')
    .description(
      'Flag operational-policy changes (hooks, thresholds, --skip list) that lack a corresponding ADR'
    )
    .option(
      '--base <ref>',
      'Base git ref to diff against (default: merge-base with default branch)'
    )
    .option('--strict', 'Treat a missing ADR as blocking (non-zero exit), overriding config')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const result = await runCheckOperationalDrift({
        configPath: globalOpts.config,
        base: opts.base,
        strict: opts.strict,
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

      // Advisory by default: a flagged change reports but still exits 0.
      // Blocking severity (config or --strict) exits non-zero on a flag.
      const shouldFail = result.value.flagged && result.value.severity === 'blocking';
      process.exit(shouldFail ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
    });

  return command;
}
