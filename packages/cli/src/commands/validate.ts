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
} from '@harness-engineering/core';
import { execFileSync } from 'child_process';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { runAudit as runComponentAnatomyAudit } from '../mcp/tools/audit-anatomy';
import { runDetectDrift } from '../mcp/tools/detect-drift';
import { runAuditBrand } from '../mcp/tools/audit-brand';

interface ValidateOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  agentConfigs?: boolean;
  strict?: boolean;
  agnixBin?: string;
}

interface ValidateResult {
  valid: boolean;
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
    checks: {
      agentsMap: false,
      fileStructure: false,
      knowledgeMap: false,
    },
    issues: [],
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

  // Roadmap health (regression guard). Read-only diagnostics over docs/roadmap.md:
  // catch-all milestones (error), done-outside-archive, unactionable planned rows,
  // and oversized active milestones (warnings). Skipped silently when no roadmap
  // file exists (file-less mode or uninitialized projects). Error-severity findings
  // fail validation; warnings are surfaced but do not flip result.valid.
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

  return Ok(result);
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
  });

  if (!result.ok) {
    if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
    else logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }

  if (opts.crossCheck) await printCrossCheckWarnings(mode);
  emitValidateOutput(result.value, mode, formatter);
  process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
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
  const output = formatter.formatValidation({ valid: value.valid, issues: value.issues });
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
