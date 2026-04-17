import { Command } from 'commander';
import * as path from 'path';
import type { AgentConfigValidation, Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import {
  validateAgentConfigs,
  validateAgentsMap,
  validateKnowledgeMap,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

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
