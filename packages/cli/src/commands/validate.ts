import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentConfigValidation, Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import {
  validateAgentConfigs,
  validateAgentsMap,
  validateKnowledgeMap,
  validatePulseConfig,
  validateSolutionsDir,
  validateStrategy,
  validateRoadmapMode,
  parseRoadmap,
  checkRoadmapHealth,
  needsMergeOursDriverWarning,
  checkRoadmapAggregateDrift,
  detectRoadmapStorageMode,
  regenerate,
  createNodeRoadmapIO,
} from '@harness-engineering/core';
import { execFileSync } from 'node:child_process';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode, type ExitCodeType } from '../utils/errors';
import { runAudit as runComponentAnatomyAudit } from '../mcp/tools/audit-anatomy';
import { runDetectDrift } from '../mcp/tools/detect-drift';
import { runAuditBrand } from '../mcp/tools/audit-brand';

type ValidateSeverity = 'error' | 'warning' | 'info';

const SEVERITY_RANK: Record<ValidateSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

interface ValidateOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  agentConfigs?: boolean;
  strict?: boolean;
  agnixBin?: string;
  /**
   * Minimum severity that fails the command. When set, aggregated findings
   * below the threshold are excluded from BOTH the report and the pass/fail
   * verdict — the same contract as `check-security --severity`. When omitted,
   * behavior is unchanged: every finding is reported and the verdict fails on
   * the hard checks (which carry no explicit severity and are treated as
   * error-level) and on error-severity findings, while warnings never fail.
   */
  severity?: ValidateSeverity;
}

/**
 * One check that could not run.
 *
 * A check whose input exists but cannot be consumed has ABSTAINED — it neither
 * passed nor failed, and reporting it as either is a lie. Abstentions are kept in
 * their own ledger rather than in {@link ValidateResult.issues} for two reasons:
 * an abstention is a fact about the REPORT's completeness rather than a finding
 * about the project's health, and `--severity` filters `issues` (then recomputes
 * `valid` from what survives), so an abstention living there could be filtered
 * away — reintroducing the very false green this ledger exists to prevent.
 */
interface UnavailableCheck {
  /** The check that abstained. Matches a key of {@link ValidateResult.checks}. */
  check: string;
  /** The input the check could not consume, when the check is file-scoped. */
  file?: string;
  /** Why it could not run. Carries the underlying error message verbatim. */
  reason: string;
  /** What the operator should do about it. */
  suggestion?: string;
}

interface ValidateResult {
  valid: boolean;
  /**
   * False when at least one check could not run. `valid` alone is not
   * trustworthy while this is false — the run has an incomplete denominator.
   */
  complete: boolean;
  checks: {
    agentsMap: boolean;
    fileStructure: boolean;
    knowledgeMap: boolean;
    agentConfigs?: boolean;
    pulseConfig?: boolean;
    strategyConfig?: boolean;
    solutionsDir?: boolean;
    roadmapMode?: boolean;
    roadmapHealth?: boolean;
    mergeDriver?: boolean;
    roadmapAggregateDrift?: boolean;
    componentAnatomy?: boolean;
    driftDetection?: boolean;
    brandCompliance?: boolean;
  };
  issues: Array<{
    check: string;
    file?: string;
    line?: number;
    ruleId?: string;
    severity?: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
  /**
   * Checks that could not run. Always present; empty on a complete run. Never
   * touched by `--severity` — an abstention must not be filterable.
   */
  unavailableChecks: UnavailableCheck[];
  agentConfigs?: AgentConfigValidation;
}

export async function runValidate(
  options: ValidateOptions
): Promise<Result<ValidateResult, CLIError>> {
  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  // Derive cwd from config file location if not explicitly provided
  const cwd =
    options.cwd ??
    (options.configPath ? path.dirname(path.resolve(options.configPath)) : process.cwd());

  const result: ValidateResult = {
    valid: true,
    complete: true,
    checks: {
      agentsMap: false,
      fileStructure: false,
      knowledgeMap: false,
    },
    issues: [],
    unavailableChecks: [],
  };

  // Check AGENTS.md
  const agentsMapPath = path.resolve(cwd, config.agentsMapPath);
  const agentsResult = await validateAgentsMap(agentsMapPath);
  if (agentsResult.ok) {
    result.checks.agentsMap = true;
  } else {
    result.valid = false;
    result.issues.push({
      check: 'agentsMap',
      file: config.agentsMapPath,
      message: agentsResult.error.message,
      ...(agentsResult.error.suggestions?.[0] !== undefined && {
        suggestion: agentsResult.error.suggestions[0],
      }),
    });
  }

  // Check knowledge map integrity (no broken links)
  const knowledgeResult = await validateKnowledgeMap(cwd);
  if (knowledgeResult.ok && knowledgeResult.value.brokenLinks.length === 0) {
    result.checks.knowledgeMap = true;
  } else if (knowledgeResult.ok) {
    result.valid = false;
    for (const broken of knowledgeResult.value.brokenLinks) {
      result.issues.push({
        check: 'knowledgeMap',
        file: broken.path,
        message: `Broken link: ${broken.path}`,
        suggestion: broken.suggestion || 'Remove or fix the broken link',
      });
    }
  } else {
    result.valid = false;
    result.issues.push({
      check: 'knowledgeMap',
      message: knowledgeResult.error.message,
    });
  }

  // Check file structure if conventions defined
  // For now, mark as passed if no conventions
  result.checks.fileStructure = true;

  // Pulse config (optional — passes if absent)
  const pulseResult = await validatePulseConfig(cwd);
  if (pulseResult.ok) {
    result.checks.pulseConfig = true;
  } else {
    result.valid = false;
    result.checks.pulseConfig = false;
    result.issues.push({
      check: 'pulseConfig',
      file: 'harness.config.json',
      message: pulseResult.error.message,
      ...(pulseResult.error.suggestions?.[0] !== undefined && {
        suggestion: pulseResult.error.suggestions[0],
      }),
    });
  }

  // STRATEGY.md (optional — passes if absent; fails when present and malformed)
  const strategyResult = await validateStrategy(cwd);
  if (strategyResult.ok) {
    result.checks.strategyConfig = true;
  } else {
    result.valid = false;
    result.checks.strategyConfig = false;
    result.issues.push({
      check: 'strategyConfig',
      file: 'STRATEGY.md',
      severity: 'error',
      message: strategyResult.error.message,
      ...(strategyResult.error.suggestions?.[0] !== undefined && {
        suggestion: strategyResult.error.suggestions[0],
      }),
    });
  }

  // Solutions directory (optional — passes if absent)
  const solutionsResult = await validateSolutionsDir(cwd);
  if (solutionsResult.ok) {
    result.checks.solutionsDir = true;
  } else {
    result.valid = false;
    result.checks.solutionsDir = false;
    const detail = solutionsResult.error.details;
    for (const issue of detail.issues ?? [
      { file: 'docs/solutions', message: solutionsResult.error.message },
    ]) {
      result.issues.push({ check: 'solutionsDir', file: issue.file, message: issue.message });
    }
  }

  // Roadmap mode (cross-cutting: tracker presence + docs/roadmap.md absence in file-less mode)
  const roadmapModeResult = validateRoadmapMode(config, cwd);
  if (roadmapModeResult.ok) {
    result.checks.roadmapMode = true;
  } else {
    result.valid = false;
    result.checks.roadmapMode = false;
    result.issues.push({
      check: 'roadmapMode',
      file: 'harness.config.json',
      ruleId: roadmapModeResult.error.code,
      severity: 'error',
      message: roadmapModeResult.error.message,
      ...(roadmapModeResult.error.suggestions?.[0] !== undefined && {
        suggestion: roadmapModeResult.error.suggestions[0],
      }),
    });
  }

  // Merge-driver doctor (warning). `.gitattributes` may declare generated
  // aggregates (e.g. docs/roadmap.md) as merge=ours, but that attribute is inert
  // until the clone runs `git config merge.ours.driver true` once. Surface a
  // non-fatal warning so existing clones know about the one-time fix (C4).
  const gitattributesPath = path.join(cwd, '.gitattributes');
  if (fs.existsSync(gitattributesPath)) {
    const gitattributesContent = fs.readFileSync(gitattributesPath, 'utf-8');
    let driverConfigured = false;
    try {
      const out = execFileSync('git', ['config', '--get', 'merge.ours.driver'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      driverConfigured = out.length > 0 && out !== 'false';
    } catch {
      // git unavailable or cwd is not a repo — treat as unconfigured.
    }
    if (needsMergeOursDriverWarning(gitattributesContent, driverConfigured)) {
      result.checks.mergeDriver = false;
      result.issues.push({
        check: 'mergeDriver',
        file: '.gitattributes',
        severity: 'warning',
        message:
          'Generated files are declared merge=ours but merge.ours.driver is unset in this clone (the attribute is inert without it). One-time fix: git config merge.ours.driver true',
      });
    } else {
      result.checks.mergeDriver = true;
    }
  }

  // Roadmap aggregate-drift doctor (warning). In sharded mode (docs/roadmap.d/
  // present) the aggregate is a generated view; the local husky regen hook is
  // per-developer and invisible to CI. Surface a non-fatal warning when the
  // committed aggregate has drifted from a fresh regeneration of the shards so the
  // pipeline catches staleness — the adopter freshness contract. No-op for monolith
  // projects (no shard dir). The fix is `harness roadmap regen`.
  // Route shard presence through the single detection authority so "one place
  // decides sharded" is literally true (behaviorally identical to probing
  // docs/roadmap.d/ directly for the conventional docs/ layout).
  if (detectRoadmapStorageMode(cwd) === 'sharded') {
    const shardDir = path.join(cwd, 'docs', 'roadmap.d');
    const regenerated = await regenerate(shardDir, createNodeRoadmapIO());
    const aggregatePath = path.join(cwd, 'docs', 'roadmap.md');
    const committedAggregate = fs.existsSync(aggregatePath)
      ? fs.readFileSync(aggregatePath, 'utf-8')
      : null;
    if (!regenerated.ok) {
      // The shards could not be regenerated, so there was nothing to compare the
      // committed aggregate against. checkRoadmapAggregateDrift would return
      // `applicable: false` here, which is indistinguishable from the monolith
      // no-op — reporting it as a passed check would claim a freshness comparison
      // that never happened. The doctor abstains instead, and the comparison is
      // not even attempted.
      result.unavailableChecks.push({
        check: 'roadmapAggregateDrift',
        file: 'docs/roadmap.d/',
        reason: `docs/roadmap.d/ could not be regenerated, so aggregate freshness was not compared: ${regenerated.error.message}`,
        suggestion:
          'Fix the reported shard under docs/roadmap.d/, then run `harness roadmap regen`.',
      });
      // Regeneration succeeded and the shard dir exists, so `applicable` is
      // necessarily true here — `stale` alone carries the verdict.
    } else if (
      checkRoadmapAggregateDrift({
        shardDirExists: true,
        committedAggregate,
        regeneratedAggregate: regenerated.value,
      }).stale
    ) {
      result.checks.roadmapAggregateDrift = false;
      result.issues.push({
        check: 'roadmapAggregateDrift',
        file: 'docs/roadmap.md',
        severity: 'warning',
        message:
          'docs/roadmap.md is stale vs docs/roadmap.d/ — run `harness roadmap regen` to regenerate the aggregate.',
      });
    } else {
      result.checks.roadmapAggregateDrift = true;
    }
  }

  // Roadmap health (regression guard). Read-only diagnostics over docs/roadmap.md:
  // catch-all milestones (error), done-outside-archive, unactionable planned rows,
  // and oversized active milestones (warnings). Skipped silently when no roadmap
  // file exists (file-less mode or uninitialized projects) — that is "not
  // applicable", not "could not check". Error-severity findings fail validation;
  // warnings are surfaced but do not flip result.valid.
  //
  // When the file EXISTS but the parser rejects it, the check ABSTAINS: it is
  // recorded in result.unavailableChecks (which forces `complete: false` and a
  // ZERO_DENOMINATOR exit) rather than silently skipped. Every roadmap-health rule
  // disappears at once on a parse failure, so a silent skip here is exactly the
  // false green this ledger exists to prevent — the worse the roadmap, the less it
  // would have been checked.
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  if (fs.existsSync(roadmapPath)) {
    const parsed = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
    if (parsed.ok) {
      const findings = checkRoadmapHealth(parsed.value);
      result.checks.roadmapHealth = !findings.some((f) => f.severity === 'error');
      if (!result.checks.roadmapHealth) result.valid = false;
      for (const finding of findings) {
        result.issues.push({
          check: 'roadmapHealth',
          file: 'docs/roadmap.md',
          ruleId: finding.ruleId,
          severity: finding.severity === 'error' ? 'error' : 'warning',
          message: finding.feature
            ? `${finding.feature} (${finding.milestone}): ${finding.message}`
            : finding.message,
          ...(finding.suggestion !== undefined && { suggestion: finding.suggestion }),
        });
      }
    } else {
      result.unavailableChecks.push({
        check: 'roadmapHealth',
        file: 'docs/roadmap.md',
        reason: `docs/roadmap.md could not be parsed, so no roadmap health rule ran: ${parsed.error.message}`,
        suggestion:
          'Fix the reported section in docs/roadmap.md (or its docs/roadmap.d/ shard) and re-run `harness validate`.',
      });
    }
  }

  // Component-anatomy fast-mode audit (design-pipeline #2).
  // Enabled by default per the schema; opts out via
  // `design.audit.componentAnatomy.enabled: false`. Runs the
  // convention-only path (cheap AST scan); pattern queries are opt-in
  // via `design.audit.componentAnatomy.fastMode.patterns: true` (not
  // honored in MVP — patterns return empty regardless).
  const anatomyEnabled = config.design?.audit?.componentAnatomy?.enabled !== false;
  if (anatomyEnabled) {
    try {
      const strictness = (config.design?.strictness ?? 'standard') as
        | 'strict'
        | 'standard'
        | 'permissive';
      const auditOutput = await runComponentAnatomyAudit({
        path: cwd,
        mode: 'fast',
        designStrictness: strictness,
      });
      result.checks.componentAnatomy = true;
      // Error-severity findings fail validation. warn/info are surfaced
      // as issues but don't flip result.valid.
      for (const finding of auditOutput.findings) {
        const severity: 'error' | 'warning' | 'info' =
          finding.severity === 'warn' ? 'warning' : finding.severity;
        if (severity === 'error') result.valid = false;
        result.issues.push({
          check: 'componentAnatomy',
          file: finding.file,
          ...(finding.line !== null && finding.line !== undefined && { line: finding.line }),
          ruleId: finding.code,
          severity,
          message: finding.message,
          suggestion: finding.fix.description,
        });
      }
    } catch (err) {
      // Audit failures don't sink the whole validate — degrade gracefully
      // with a single warning so the rest of the checks still report.
      result.checks.componentAnatomy = false;
      result.issues.push({
        check: 'componentAnatomy',
        severity: 'warning',
        message: `Component-anatomy audit skipped: ${(err as Error).message}`,
      });
    }
  }

  // Detect-design-drift fast-mode (design-pipeline #1, detect half).
  // Enabled by default; opts out via
  // `design.audit.driftDetection.enabled: false`. Walks the project for
  // hardcoded values (DRIFT-T*) and primitive-adoption violations
  // (DRIFT-P*). Both rule families skip silently when their resolver
  // input is absent (tokens.json / DESIGN.md ## Component Registry).
  const driftEnabled = config.design?.audit?.driftDetection?.enabled !== false;
  if (driftEnabled) {
    try {
      const strictness = (config.design?.strictness ?? 'standard') as
        | 'strict'
        | 'standard'
        | 'permissive';
      // design.exclude (and the project-wide analysis.exclude) are loaded
      // inside runDetectDrift, so every drift entry point honors them uniformly
      // — no per-caller threading needed here.
      const driftOutput = await runDetectDrift({
        path: cwd,
        mode: 'fast',
        designStrictness: strictness,
      });
      result.checks.driftDetection = true;
      for (const finding of driftOutput.findings) {
        const severity: 'error' | 'warning' | 'info' =
          finding.severity === 'warn' ? 'warning' : finding.severity;
        if (severity === 'error') result.valid = false;
        result.issues.push({
          check: 'driftDetection',
          file: finding.file,
          ...(finding.line !== null && finding.line !== undefined && { line: finding.line }),
          ruleId: finding.code,
          severity,
          message: finding.message,
          suggestion: finding.fix.description,
        });
      }
    } catch (err) {
      result.checks.driftDetection = false;
      result.issues.push({
        check: 'driftDetection',
        severity: 'warning',
        message: `Drift detection skipped: ${(err as Error).message}`,
      });
    }
  }

  // Audit-brand-compliance fast-mode (design-pipeline #3).
  // Enabled by default; opts out via
  // `design.audit.brandCompliance.enabled: false`. Detects token misuse
  // (BRAND-T001 — token used in $extensions.harness.brand.forbidden_contexts)
  // and voice violations (BRAND-V001 — UI copy containing voice.forbidden_phrases
  // from DESIGN.md ## Brand Rules). Both rule families skip silently when
  // their resolver input is absent.
  const brandEnabled = config.design?.audit?.brandCompliance?.enabled !== false;
  if (brandEnabled) {
    try {
      const strictness = (config.design?.strictness ?? 'standard') as
        | 'strict'
        | 'standard'
        | 'permissive';
      const brandOutput = await runAuditBrand({
        path: cwd,
        mode: 'fast',
        designStrictness: strictness,
      });
      result.checks.brandCompliance = true;
      for (const finding of brandOutput.findings) {
        const severity: 'error' | 'warning' | 'info' =
          finding.severity === 'warn' ? 'warning' : finding.severity;
        if (severity === 'error') result.valid = false;
        result.issues.push({
          check: 'brandCompliance',
          file: finding.file,
          ...(finding.line !== null && finding.line !== undefined && { line: finding.line }),
          ruleId: finding.code,
          severity,
          message: finding.message,
          suggestion: finding.fix.description,
        });
      }
    } catch (err) {
      result.checks.brandCompliance = false;
      result.issues.push({
        check: 'brandCompliance',
        severity: 'warning',
        message: `Brand compliance audit skipped: ${(err as Error).message}`,
      });
    }
  }

  // Opt-in agent config validation (agnix binary preferred, TS fallback otherwise)
  if (options.agentConfigs) {
    const agentCfg = await validateAgentConfigs(cwd, {
      strict: options.strict === true,
      ...(options.agnixBin !== undefined && { agnixBin: options.agnixBin }),
    });
    result.agentConfigs = agentCfg;
    result.checks.agentConfigs = agentCfg.valid;
    if (!agentCfg.valid) result.valid = false;
    for (const finding of agentCfg.issues) {
      result.issues.push({
        check: 'agentConfigs',
        file: finding.file,
        ...(finding.line !== undefined && { line: finding.line }),
        ruleId: finding.ruleId,
        severity: finding.severity,
        message: finding.message,
        ...(finding.suggestion !== undefined && { suggestion: finding.suggestion }),
      });
    }
  }

  // `--severity` (when provided) bounds BOTH the reported findings and the
  // pass/fail verdict, mirroring `check-security`: validation fails only when a
  // finding at or above the requested threshold exists, and findings below it are
  // excluded from the report and never fail the gate. When the flag is OMITTED,
  // behavior is unchanged — the per-check `result.valid` accumulated above (hard
  // checks and error-severity findings fail; warnings are reported but never
  // flip the verdict) stands as-is. Several hard checks (agentsMap, knowledgeMap,
  // pulseConfig, solutionsDir) push findings with no explicit severity; they are
  // hard failures, so they rank as error-level for threshold comparison.
  if (options.severity) {
    const thresholdRank = SEVERITY_RANK[options.severity];
    const filtered = result.issues.filter(
      (issue) => SEVERITY_RANK[issue.severity ?? 'error'] >= thresholdRank
    );
    result.issues = filtered;
    result.valid = filtered.length === 0;
  }

  // Derived AT the return site, not assigned somewhere above it. Two properties
  // follow structurally rather than by convention: the `--severity` filter above
  // provably cannot influence it (it bounds which FINDINGS are reported and must
  // never hide the fact that a check did not run at all), and any early return
  // added to this function in future cannot ship a stale `complete: true` over a
  // populated ledger — it would have to restore the false green deliberately.
  return Ok({ ...result, complete: result.unavailableChecks.length === 0 });
}

function resolveValidateMode(globalOpts: Record<string, unknown>): OutputModeType {
  if (globalOpts.json) return OutputMode.JSON;
  if (globalOpts.quiet) return OutputMode.QUIET;
  if (globalOpts.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}

async function printCrossCheckWarnings(mode: OutputModeType): Promise<void> {
  const { runCrossCheck } = await import('./validate-cross-check');
  const cwd = process.cwd();
  const crossResult = await runCrossCheck({
    specsDir: path.join(cwd, 'docs', 'specs'),
    plansDir: path.join(cwd, 'docs', 'plans'),
    projectPath: cwd,
  });
  if (!crossResult.ok || crossResult.value.warnings === 0) return;
  if (mode === OutputMode.JSON) return;
  console.log('\nCross-artifact validation:');
  for (const w of crossResult.value.planToImpl) console.log(`  ! ${w}`);
  for (const w of crossResult.value.staleness) console.log(`  ! ${w}`);
  console.log(`\n  ${crossResult.value.warnings} warnings`);
}

export function createValidateCommand(): Command {
  const command = new Command('validate')
    .description('Run all validation checks')
    .option('--cross-check', 'Run cross-artifact consistency validation')
    .option(
      '--agent-configs',
      'Validate agent configs (CLAUDE.md, hooks, skills) via agnix or built-in fallback rules'
    )
    .option('--strict', 'Treat warnings as errors (applies to --agent-configs)')
    .option('--agnix-bin <path>', 'Override the agnix binary path discovered on PATH')
    .option(
      '--severity <level>',
      'Minimum severity that fails the command; when set, findings below it are excluded from the report and never fail the gate (error, warning, info)'
    )
    .hook('preAction', (thisCommand) => {
      const severity = thisCommand.opts().severity;
      if (severity !== undefined && !['error', 'warning', 'info'].includes(severity)) {
        logger.error(`Invalid severity: "${severity}". Must be one of: error, warning, info`);
        process.exit(ExitCode.ERROR);
      }
    })
    .action(async (opts, cmd) => runValidateAction(opts, cmd.optsWithGlobals()));
  return command;
}

async function runValidateAction(
  opts: Record<string, unknown>,
  globalOpts: Record<string, unknown>
): Promise<void> {
  const mode = resolveValidateMode(globalOpts);
  const formatter = new OutputFormatter(mode);

  const result = await runValidate({
    ...(typeof globalOpts.config === 'string' && { configPath: globalOpts.config }),
    json: globalOpts.json === true,
    verbose: globalOpts.verbose === true,
    quiet: globalOpts.quiet === true,
    agentConfigs: opts.agentConfigs === true,
    strict: opts.strict === true,
    ...(typeof opts.agnixBin === 'string' && { agnixBin: opts.agnixBin }),
    ...(typeof opts.severity === 'string' && { severity: opts.severity as ValidateSeverity }),
  });

  if (!result.ok) {
    if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
    else logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }

  if (opts.crossCheck) await printCrossCheckWarnings(mode);
  emitValidateOutput(result.value, mode, formatter);
  process.exit(resolveValidateExitCode(result.value));
}

/**
 * Map the three possible states of a validation run onto three distinct exit codes:
 * checked-and-healthy (0), checked-and-unhealthy (1), and could-not-check
 * (ZERO_DENOMINATOR / 3). With only two codes, "could not check" has to be encoded
 * as one of the other two — and encoding it as success is the false green this
 * mapping removes.
 *
 * Abstention OUTRANKS failure. Exit 1 carries the implicit claim "here is the
 * complete list of what is wrong"; that claim is false once a check could not run,
 * and a caller who fixes every reported finding would still be flying blind on the
 * abstained one. Both codes are non-zero, so precedence cannot flip any gate from
 * red to green — it only decides which non-green signal the caller sees, and the
 * findings that would have produced exit 1 are still printed in full.
 */
function resolveValidateExitCode(value: ValidateResult): ExitCodeType {
  if (!value.complete) return ExitCode.ZERO_DENOMINATOR;
  return value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED;
}

function emitValidateOutput(
  value: ValidateResult,
  mode: OutputModeType,
  formatter: OutputFormatter
): void {
  if (mode === OutputMode.JSON) {
    // Emit the full ValidateResult so the agentConfigs section (engine, fallback reason) is visible.
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  const output = formatter.formatValidation({
    valid: value.valid,
    issues: value.issues,
    unavailableChecks: value.unavailableChecks,
  });
  if (output) console.log(output);
  if (value.agentConfigs) printAgentConfigSummary(value.agentConfigs, mode);
}

function printAgentConfigSummary(cfg: AgentConfigValidation, mode: OutputModeType): void {
  if (mode === OutputMode.QUIET) return;
  const engineLabel = cfg.engine === 'agnix' ? 'agnix' : 'built-in fallback rules';
  const note = cfg.fellBackBecause ? ` (${cfg.fellBackBecause})` : '';
  console.log(`\nAgent configs checked via ${engineLabel}${note}`);
  if (cfg.engine === 'fallback' && cfg.fellBackBecause === 'binary-not-found') {
    console.log('  Install agnix for 385+ rule coverage: https://github.com/agent-sh/agnix');
  }
}
