import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { VocabularyConfigSchema } from '../config/schema';
import { scanFiles, resolveScanFiles, formatViolations } from '../vocabulary/scanner';
import type { Violation } from '../vocabulary/scanner';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface CheckVocabularyOptions {
  cwd?: string;
  configPath?: string;
}

interface CheckVocabularyResult {
  valid: boolean;
  /** True when the gate was inert (disabled or no rules) and passed trivially. */
  skipped: boolean;
  filesScanned: number;
  rulesApplied: number;
  violations: Violation[];
}

export async function runCheckVocabulary(
  options: CheckVocabularyOptions
): Promise<Result<CheckVocabularyResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }

  // Fill defaults (paths/exclude) even when the `vocabulary` block is omitted, so
  // an absent block behaves like an enabled-but-ruleless gate: it passes trivially.
  const vocab = VocabularyConfigSchema.parse(configResult.value.vocabulary ?? {});

  // Trivial pass: gate disabled, or no rules to enforce.
  if (!vocab.enabled || vocab.rules.length === 0) {
    return Ok({
      valid: true,
      skipped: true,
      filesScanned: 0,
      rulesApplied: vocab.rules.length,
      violations: [],
    });
  }

  const root = path.resolve(cwd);
  const scan = { include: vocab.paths, exclude: vocab.exclude };
  const scanned = await resolveScanFiles(root, scan);
  const violations = await scanFiles(root, scan, vocab.rules);

  return Ok({
    valid: violations.length === 0,
    skipped: false,
    filesScanned: scanned.length,
    rulesApplied: vocab.rules.length,
    violations,
  });
}

function printCheckVocabularyResult(
  value: CheckVocabularyResult,
  formatter: OutputFormatter,
  mode: OutputModeType
): void {
  if (value.skipped) {
    if (mode !== OutputMode.QUIET) {
      console.log(formatter.formatSummary('Semantic vocabulary', 'no rules — skipped', true));
    }
    return;
  }

  console.log(
    formatter.formatSummary(
      'Semantic vocabulary',
      value.valid
        ? `${value.filesScanned} files, ${value.rulesApplied} rules — clean`
        : `${value.violations.length} violation(s)`,
      value.valid
    )
  );

  if (!value.valid) {
    console.log(
      '\nDeprecated canonical terms found — replace with the suggested canonical term\n' +
        '(or add an exemption to the `vocabulary` block in harness.config.json):\n'
    );
    console.log(formatViolations(value.violations));
  }
}

export function createCheckVocabularyCommand(): Command {
  const command = new Command('check-vocabulary')
    .description('Fail when deprecated or renamed canonical terms reappear in skills/docs prose')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runCheckVocabulary({ configPath: globalOpts.config });

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
        printCheckVocabularyResult(result.value, formatter, mode);
      }

      process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
