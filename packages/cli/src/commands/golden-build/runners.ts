import { execSync } from 'node:child_process';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err, GoldenBuildManager, GoldenConfigSchema } from '@harness-engineering/core';
import type { GoldenSnapshot, GoldenDiffResult, GoldenConfig } from '@harness-engineering/core';
import { findConfigFile, loadConfig } from '../../config/loader';
import { CLIError, ExitCode } from '../../utils/errors';

export interface GoldenCommandOptions {
  cwd?: string;
  configPath?: string;
  /** Override the configured reference paths (repeatable `--path`). */
  paths?: string[];
}

export interface GoldenPromoteResult {
  changed: boolean;
  commit: string;
  branch: string;
  fileCount: number;
  manifestPath: string;
  snapshot: GoldenSnapshot;
}

export interface GoldenVerifyResult {
  clean: boolean;
  diff: GoldenDiffResult;
  /** Absent when no golden has been promoted yet. */
  golden: GoldenSnapshot | null;
}

function gitOutput(cmd: string, cwd: string): string {
  try {
    // stderr is silenced: outside a git repo these commands fail noisily, but
    // an 'unknown' provenance stamp is a fine fallback (it is informational).
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Resolve config, cwd, and the golden config (with defaults) shared by every
 * subcommand. Returns the constructed manager plus the resolved config so
 * callers can honour `--path` overrides.
 */
function resolveManager(
  options: GoldenCommandOptions
): Result<{ manager: GoldenBuildManager; cwd: string; config: GoldenConfig }, CLIError> {
  const configPathResult = options.configPath ? Ok(options.configPath) : findConfigFile();
  if (!configPathResult.ok) return configPathResult;

  const configResult = loadConfig(configPathResult.value);
  if (!configResult.ok) return configResult;

  const cwd = options.cwd ?? path.dirname(configPathResult.value);
  const goldenConfig: GoldenConfig =
    (configResult.value as { golden?: GoldenConfig }).golden ?? GoldenConfigSchema.parse({});

  const referencePaths =
    options.paths && options.paths.length > 0 ? options.paths : goldenConfig.referencePaths;

  const manager = new GoldenBuildManager(cwd, {
    manifestPath: goldenConfig.manifestPath,
    referencePaths,
  });
  return Ok({ manager, cwd, config: goldenConfig });
}

/**
 * `promote` — snapshot the current working tree as the new golden build.
 * Byte-stable: a re-promote whose fingerprint is unchanged leaves the manifest
 * untouched.
 */
export async function runGoldenPromote(
  options: GoldenCommandOptions
): Promise<Result<GoldenPromoteResult, CLIError>> {
  const resolved = resolveManager(options);
  if (!resolved.ok) return resolved;
  const { manager, cwd, config } = resolved.value;

  const commit = gitOutput('git rev-parse --short HEAD', cwd);
  const branch = gitOutput('git rev-parse --abbrev-ref HEAD', cwd);
  const { snapshot, changed } = manager.promote({ commit, branch });

  return Ok({
    changed,
    commit: snapshot.commit,
    branch: snapshot.branch,
    fileCount: snapshot.files.length,
    manifestPath: config.manifestPath,
    snapshot,
  });
}

/**
 * `verify` — compare the working tree against the most recent golden. The
 * caller exits non-zero when `clean` is false (or when no golden exists).
 */
export async function runGoldenVerify(
  options: GoldenCommandOptions
): Promise<Result<GoldenVerifyResult, CLIError>> {
  const resolved = resolveManager(options);
  if (!resolved.ok) return resolved;
  const { manager } = resolved.value;

  const golden = manager.load();
  if (!golden) {
    return Err(
      new CLIError(
        'No golden build found. Run `harness golden-build promote` to capture a known-good reference state first.',
        ExitCode.ERROR
      )
    );
  }

  const diff = manager.diff(golden);
  return Ok({ clean: diff.clean, diff, golden });
}

/**
 * `diff` — explain what has drifted since the last golden. Same comparison as
 * `verify`, but always advisory (exit 0). Returns a null golden when none
 * exists rather than erroring, so `diff` can be run speculatively.
 */
export async function runGoldenDiff(
  options: GoldenCommandOptions
): Promise<Result<GoldenVerifyResult, CLIError>> {
  const resolved = resolveManager(options);
  if (!resolved.ok) return resolved;
  const { manager } = resolved.value;

  const golden = manager.load();
  if (!golden) {
    return Ok({
      clean: true,
      diff: { clean: true, changed: [], missing: [], added: [] },
      golden: null,
    });
  }
  const diff = manager.diff(golden);
  return Ok({ clean: diff.clean, diff, golden });
}
