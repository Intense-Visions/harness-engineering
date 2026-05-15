import { Command } from 'commander';
import { execSync } from 'child_process';
import { validateBranchName, type BranchingConfig } from '@harness-engineering/core';
import { resolveConfig, findConfigFile } from '../config/loader';
import { BranchingConfigSchema } from '../config/schema';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface VerifyOptions {
  configPath?: string;
  branch?: string;
  json?: boolean;
}

interface VerifyJsonOutput {
  valid: boolean;
  branchName: string;
  message?: string;
  suggestion?: string;
}

/**
 * Resolve the branching config, defaulting to schema defaults when no
 * `harness.config.json` is present. Verification of conventions should not
 * require project onboarding.
 */
function loadBranchingConfig(configPath: string | undefined): BranchingConfig {
  // Only attempt to load a config if the user explicitly pointed at one,
  // or one is discoverable from cwd. Otherwise fall back to schema defaults
  // so `harness verify` works on greenfield/external repos.
  const shouldLoad = configPath !== undefined || findConfigFile().ok;
  if (!shouldLoad) {
    return BranchingConfigSchema.parse({});
  }

  const result = resolveConfig(configPath);
  if (!result.ok) {
    // Explicit config path failed -- surface the error.
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }
  const cfg = result.value.compliance?.branching;
  return cfg ?? BranchingConfigSchema.parse({});
}

/**
 * Determine the branch name to verify. CI runners typically run in detached
 * HEAD on PR builds, so `git rev-parse --abbrev-ref HEAD` returns the literal
 * "HEAD". Honour explicit overrides and common CI env vars first.
 */
function resolveBranchName(explicit: string | undefined): string | null {
  if (explicit && explicit.length > 0) return explicit;

  const envBranch =
    process.env.HARNESS_BRANCH ||
    process.env.GITHUB_HEAD_REF ||
    process.env.CI_COMMIT_REF_NAME ||
    process.env.BUILDKITE_BRANCH;
  if (envBranch && envBranch.length > 0) return envBranch;

  try {
    const out = execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out && out !== 'HEAD') return out;
  } catch {
    return null;
  }
  return null;
}

export async function runVerify(options: VerifyOptions): Promise<void> {
  const branchingConfig = loadBranchingConfig(options.configPath);

  const branchName = resolveBranchName(options.branch);
  if (!branchName) {
    const msg =
      'Could not determine the current branch name. Pass --branch <name>, set HARNESS_BRANCH/GITHUB_HEAD_REF, or run inside a git checkout.';
    if (options.json) {
      console.log(JSON.stringify({ valid: false, branchName: '', message: msg }));
    } else {
      logger.error(msg);
    }
    process.exit(ExitCode.ERROR);
  }

  const result = validateBranchName(branchName, branchingConfig);

  if (options.json) {
    const payload: VerifyJsonOutput = {
      valid: result.valid,
      branchName: result.branchName,
      ...(result.message !== undefined && { message: result.message }),
      ...(result.suggestion !== undefined && { suggestion: result.suggestion }),
    };
    console.log(JSON.stringify(payload));
    process.exit(result.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
  }

  if (result.valid) {
    logger.success(`Branch name "${branchName}" is compliant.`);
    process.exit(ExitCode.SUCCESS);
  }
  logger.error(result.message || `Branch name "${branchName}" is not compliant.`);
  if (result.suggestion) {
    logger.info(`Suggestion: ${result.suggestion}`);
  }
  process.exit(ExitCode.VALIDATION_FAILED);
}

export function createVerifyCommand(): Command {
  return new Command('verify')
    .description(
      'Verify project conventions (currently: branch naming). Works with or without a harness.config.json.'
    )
    .option(
      '--branch <name>',
      'Branch name to verify (defaults to HARNESS_BRANCH/GITHUB_HEAD_REF/current branch)'
    )
    .option('--json', 'Emit machine-readable JSON output')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await runVerify({
        ...(typeof globalOpts.config === 'string' && { configPath: globalOpts.config }),
        ...(typeof opts.branch === 'string' && { branch: opts.branch }),
        json: opts.json === true || globalOpts.json === true,
      });
    });
}
