import { Command } from 'commander';
import type {
  Result,
  DeploymentFsPort,
  DeploymentGateConfig,
  DeploymentGateResult,
  DeploymentExitCode,
} from '@harness-engineering/core';
import {
  Ok,
  detectDeploymentSurface,
  evaluateDeploymentGate,
  deriveDeploymentExitCode,
} from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
import { findConfigFile, loadConfig } from '../config/loader';
import type { HarnessConfig } from '../config/schema';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode, type ExitCodeType } from '../utils/errors';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface CheckDeploymentOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  findingsJson?: boolean;
}

/** Loud, unmistakable message for the abstention path — never a false green (SC6). */
const ABSTAIN_MESSAGE =
  'No deployment configuration detected; deploy gate not applicable (abstained).';

/** Explicit opt-out note, deliberately distinct from the abstention message (SC7). */
const DISABLED_MESSAGE =
  'Deployment gate disabled via config (deployment.enabled: false); deploy readiness not evaluated.';

/**
 * A concrete {@link DeploymentFsPort} over the node filesystem, rooted at `cwd`.
 * The engine stays pure — this adapter is the command's only IO. Every read is
 * defensive: a missing file yields `null`, a missing dir yields `[]` (never throws),
 * matching the port contract the Phase 1 engine relies on.
 */
function createNodeFsPort(root: string): DeploymentFsPort {
  return {
    exists: (relPath) => fs.existsSync(path.join(root, relPath)),
    readFile: (relPath) => {
      try {
        return fs.readFileSync(path.join(root, relPath), 'utf-8');
      } catch {
        return null;
      }
    },
    listDir: (relPath) => {
      try {
        return fs.readdirSync(path.join(root, relPath));
      } catch {
        return [];
      }
    },
  };
}

/**
 * Build the engine config from the resolved Harness config, wiring the D5 rollback
 * seam (`rollbackConfigured` from `config.rollback != null`).
 *
 * Returns `undefined` when NEITHER a `deployment` block nor a `rollback` block is
 * configured, so a bare repo with no deployment surface still abstains (the engine
 * abstains only when the passed config is nullish AND no surface is found). Passing
 * an always-present object here would suppress abstention and read as a false green.
 */
function buildGateConfig(config: HarnessConfig): DeploymentGateConfig | undefined {
  const deployment = config.deployment;
  const rollbackConfigured = config.rollback != null;
  if (deployment == null && !rollbackConfigured) {
    return undefined;
  }
  // Assign optional properties conditionally rather than spreading: under
  // `exactOptionalPropertyTypes` an optional field must be omitted, not set to
  // `undefined`, so spreading `deployment` (whose `rules` may be undefined) fails.
  const gateConfig: DeploymentGateConfig = { rollbackConfigured };
  if (deployment?.enabled !== undefined) gateConfig.enabled = deployment.enabled;
  if (deployment?.rules !== undefined) gateConfig.rules = deployment.rules;
  return gateConfig;
}

/**
 * Resolve config, detect the deployment surface, and run the Phase 1 gate engine.
 *
 * Config-resolution failures (missing / malformed `harness.config.json`) surface as
 * an `Err` carrying `ExitCode.ERROR` (D2). A successful run returns the full
 * {@link DeploymentGateResult}; the command layer maps its status to a process exit
 * code via {@link deriveDeploymentExitCode}.
 */
export async function runCheckDeployment(
  options: CheckDeploymentOptions
): Promise<Result<DeploymentGateResult, CLIError>> {
  // Resolve the config file's location first so `cwd` can default to the project
  // that owns the config rather than the process's cwd (mirrors check-arch #911).
  const configPathResult = options.configPath ? Ok(options.configPath) : findConfigFile();
  if (!configPathResult.ok) {
    return configPathResult;
  }
  const configPath = configPathResult.value;

  const configResult = loadConfig(configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  const cwd = options.cwd ?? path.dirname(configPath);
  const fsPort = createNodeFsPort(cwd);

  const surface = detectDeploymentSurface(cwd, fsPort);
  const gateConfig = buildGateConfig(config);
  const result = evaluateDeploymentGate(surface, gateConfig);
  return Ok(result);
}

function resolveOutputMode(globalOpts: Record<string, unknown>): OutputModeType {
  if (globalOpts.json) return OutputMode.JSON;
  if (globalOpts.quiet) return OutputMode.QUIET;
  if (globalOpts.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}

/** Map the core numeric exit code (D2) through the CLI's `ExitCode` enum (they align 1:1). */
function mapDeploymentExitCode(code: DeploymentExitCode): ExitCodeType {
  switch (code) {
    case 0:
      return ExitCode.SUCCESS;
    case 1:
      return ExitCode.VALIDATION_FAILED;
    case 2:
      return ExitCode.ERROR;
    case 3:
      return ExitCode.ZERO_DENOMINATOR;
  }
}

/** Flatten findings (hard first, then soft advisories) into displayable issues. */
function buildDeploymentIssues(result: DeploymentGateResult): Array<{ file?: string; message: string }> {
  return [...result.hardViolations, ...result.softViolations].map((f) => ({
    ...(f.file ? { file: f.file } : {}),
    message: `[${f.severity}] ${f.code}: ${f.detail} — ${f.remediation}`,
  }));
}

function printDeploymentResult(
  result: DeploymentGateResult,
  mode: OutputModeType,
  formatter: OutputFormatter
): void {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.status === 'abstained') {
    console.log(ABSTAIN_MESSAGE);
    return;
  }
  if (result.status === 'disabled') {
    console.log(DISABLED_MESSAGE);
    return;
  }

  const issues = buildDeploymentIssues(result);
  const output = formatter.formatValidation({
    valid: result.status === 'pass',
    issues,
  });
  if (output) console.log(output);

  // On a soft-only pass the gate is green, but the advisories must still be listed
  // (formatValidation hides issues when valid=true). Surface them explicitly (SC5).
  if (result.status === 'pass' && issues.length > 0) {
    for (const issue of issues) {
      console.log(issue.file ? `${issue.file}: ${issue.message}` : issue.message);
    }
  }
}

/** Emit the findings contract as a trailing JSON line when `--findings-json` is set. */
function maybeEmitDeploymentFindings(
  findingsJson: boolean | undefined,
  result: DeploymentGateResult
): void {
  if (findingsJson) {
    console.log(formatFindingsContract(buildDeploymentIssues(result).length, 'check-deployment'));
  }
}

export function createCheckDeploymentCommand(): Command {
  const command = new Command('check-deployment')
    .description('Verify deployment readiness and gate a deploy on hard violations')
    .option('--findings-json', 'Emit findings contract as a trailing JSON line')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runCheckDeployment({ configPath: globalOpts.config });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
        return;
      }

      const value = result.value;
      printDeploymentResult(value, mode, formatter);
      maybeEmitDeploymentFindings(opts.findingsJson, value);
      process.exit(mapDeploymentExitCode(deriveDeploymentExitCode(value)));
    });

  return command;
}
