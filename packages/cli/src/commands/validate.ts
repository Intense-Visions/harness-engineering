import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { validateAgentsMap, validateKnowledgeMap } from '@harness-engineering/core';
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
}

interface ValidateResult {
  valid: boolean;
  checks: {
    agentsMap: boolean;
    fileStructure: boolean;
    knowledgeMap: boolean;
  };
  issues: Array<{
    check: string;
    file?: string;
    message: string;
    suggestion?: string;
  }>;
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
  const cwd = options.cwd ?? (options.configPath ? path.dirname(path.resolve(options.configPath)) : process.cwd());

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
      suggestion: agentsResult.error.suggestions?.[0] ?? undefined,
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

  return Ok(result);
}

export function createValidateCommand(): Command {
  const command = new Command('validate')
    .description('Run all validation checks')
    .option('--cross-check', 'Run cross-artifact consistency validation')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : globalOpts.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const formatter = new OutputFormatter(mode);

      const result = await runValidate({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      // Cross-artifact validation
      if (opts.crossCheck) {
        const { runCrossCheck } = await import('./validate-cross-check');
        const cwd = process.cwd();
        const specsDir = path.join(cwd, 'docs', 'superpowers', 'specs');
        const plansDir = path.join(cwd, 'docs', 'superpowers', 'plans');

        const crossResult = await runCrossCheck({ specsDir, plansDir, projectPath: cwd });
        if (crossResult.ok && crossResult.value.warnings > 0) {
          console.log('\nCross-artifact validation:');
          for (const w of crossResult.value.planToImpl) console.log(`  ! ${w}`);
          for (const w of crossResult.value.staleness) console.log(`  ! ${w}`);
          console.log(`\n  ${crossResult.value.warnings} warnings`);
        }
      }

      const output = formatter.formatValidation({
        valid: result.value.valid,
        issues: result.value.issues,
      });

      if (output) {
        console.log(output);
      }

      process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
