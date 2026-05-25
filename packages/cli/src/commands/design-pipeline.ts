/**
 * `harness design-pipeline` — CLI entry for the orchestrator skill
 * (design-pipeline sub-project #5, the last sub-project).
 *
 * Mirrors `harness-docs-pipeline`'s shape: thin command layer over the
 * runDesignPipeline orchestrator that composes detect-design-drift,
 * align-design-system, audit-component-anatomy, audit-brand-compliance,
 * and design-craft-elevator into a phased pipeline with convergence-
 * based remediation.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runDesignPipeline,
  type DesignPipelineContext,
  type DesignPipelineInput,
} from '../design-pipeline/index.js';

interface DesignPipelineCliOptions {
  fix?: boolean;
  noFreshen?: boolean;
  noFill?: boolean;
  ci?: boolean;
  files?: string[];
  mode?: 'fast' | 'full';
  designStrictness?: 'strict' | 'standard' | 'permissive';
}

export function createDesignPipelineCommand(): Command {
  return new Command('design-pipeline')
    .description(
      'Run the design-pipeline orchestrator: FRESHEN → DETECT → FIX → AUDIT → FILL → REPORT. ' +
        'Composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, ' +
        'and design-craft-elevator into a single sequential pipeline with convergence-based remediation.'
    )
    .option('--fix', 'Enable convergence-based remediation (default: detect + report only)')
    .option('--no-freshen', 'Skip the FRESHEN phase')
    .option('--no-fill', 'Skip the FILL phase (input bootstrap + craft polish)')
    .option('--ci', 'Non-interactive: safe fixes only, no prompts')
    .option('-f, --files <files...>', 'Optional file/glob scope passed to each verifier')
    .option('-m, --mode <mode>', 'Verifier mode: fast | full', 'fast')
    .option(
      '--design-strictness <level>',
      'Override design.strictness: strict | standard | permissive'
    )
    .action(async (opts: DesignPipelineCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: DesignPipelineInput = { path: cwd };
      if (opts.fix === true) input.fix = true;
      if (opts.noFreshen === true) input.noFreshen = true;
      if (opts.noFill === true) input.noFill = true;
      if (opts.ci === true) input.ci = true;
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.mode !== undefined) input.mode = opts.mode;
      if (opts.designStrictness !== undefined) input.designStrictness = opts.designStrictness;

      let result: DesignPipelineContext;
      try {
        result = await runDesignPipeline(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`design-pipeline failed: ${message}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }

      if (outputMode === OutputMode.JSON) {
        // Convert Set to array for JSON serialization
        const serializable = { ...result, exclusions: [...result.exclusions] };
        console.log(JSON.stringify(serializable, null, 2));
      } else {
        printPipelineResult(result, outputMode, formatter);
      }

      const code = result.verdict === 'fail' ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS;
      process.exit(code);
    });
}

function printPipelineResult(
  result: DesignPipelineContext,
  _mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  console.log('');
  console.log(`Verdict: ${verdictBadge(result.verdict)}`);
  console.log('');
  console.log('Phases:');
  console.log(
    `  FRESHEN  inputs:` +
      ` DESIGN.md=${result.inputs.designMdExists ? 'yes' : 'no'}` +
      ` tokens.json=${result.inputs.tokensJsonExists ? 'yes' : 'no'}` +
      ` registry=${result.inputs.componentRegistryExists ? 'yes' : 'no'}` +
      ` brand=${result.inputs.brandRulesExist ? 'yes' : 'no'}`
  );
  console.log(`  DETECT   drift findings: ${result.driftFindings.length}`);
  console.log(
    `  FIX      iterations: ${result.summary.iterationsRun}, fixes applied: ${result.summary.fixesApplied}`
  );
  console.log(
    `  AUDIT    anatomy: ${result.auditFindings.anatomy.length}, brand: ${result.auditFindings.brand.length}`
  );
  const bootstrapped = Object.entries(result.bootstrapped)
    .filter(([, v]) => v)
    .map(([k]) => k);
  console.log(
    `  FILL     bootstrapped: ${bootstrapped.length > 0 ? bootstrapped.join(', ') : 'none'}, craft suggestions: ${result.craftSuggestions}`
  );
  console.log('');
  console.log(
    `Summary: ${result.summary.totalFindings} total findings ` +
      `(${result.summary.bySeverity.error} error, ${result.summary.bySeverity.warn} warn, ${result.summary.bySeverity.info} info) ` +
      `in ${result.summary.durationMs}ms`
  );
  if (result.verifiersRun.length > 0) {
    console.log(`Verifiers run: ${result.verifiersRun.join(', ')}`);
  }
  if (result.verifiersFailed.length > 0) {
    console.log('Verifiers failed (degraded):');
    for (const f of result.verifiersFailed) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }
}

function verdictBadge(verdict: 'pass' | 'warn' | 'fail'): string {
  switch (verdict) {
    case 'pass':
      return '✓ pass';
    case 'warn':
      return '⚠ warn';
    case 'fail':
      return '✗ fail';
  }
}
