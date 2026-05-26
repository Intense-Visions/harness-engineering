/**
 * `harness security-craft` — CLI entry for security-craft (craft-pipeline #10).
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runSecurityCraft,
  type SecurityCraftInput,
  type SecurityCraftOutput,
} from '../security-craft/index.js';

interface SecurityCraftCliOptions {
  files?: string[];
  packages?: string[];
  maxFiles?: string;
  maxSignalsPerFile?: string;
}

export function createSecurityCraftCommand(): Command {
  return new Command('security-craft')
    .description(
      'LLM-judgment critique of security posture (TS/JS source). Sixth non-design ' +
        'craft-pipeline ceiling skill (the final sub-project). AST-driven signal detection ' +
        'fires only on files with security-relevant constructs; conservative confidence ' +
        'defaults manage the FP risk inherent in judgment-based security.'
    )
    .option('-f, --files <files...>', 'Optional file scope (overrides discovery)')
    .option('-p, --packages <names...>', 'Restrict to specific packages under packages/')
    .option('--max-files <n>', 'Cap source-file count (default: 100)')
    .option('--max-signals-per-file <n>', 'Cap per-file signal critique (default: 10)')
    .action(async (opts: SecurityCraftCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: SecurityCraftInput = { path: cwd };
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.packages !== undefined) input.packages = opts.packages;
      if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
      if (opts.maxSignalsPerFile !== undefined)
        input.maxSignalsPerFile = parseInt(opts.maxSignalsPerFile, 10);

      let result: SecurityCraftOutput;
      try {
        result = await runSecurityCraft(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`security-craft failed: ${message}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }

      if (outputMode === OutputMode.JSON) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result, outputMode, formatter);
      }

      const hasFoundational = result.findings.some((f) => f.tier === 'foundational');
      process.exit(hasFoundational ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
    });
}

function printResult(
  result: SecurityCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No security findings.');
  } else {
    const byFile = new Map<string, typeof findings>();
    for (const f of findings) {
      const list = byFile.get(f.target.file) ?? [];
      list.push(f);
      byFile.set(f.target.file, list);
    }
    for (const [file, fs] of byFile) {
      console.log(`\n${file}`);
      for (const f of fs) {
        console.log(
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.signal}:${f.target.line}`
        );
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${findings.length} findings across ${summary.counts.filesScanned} files ` +
      `(${summary.counts.filesSkippedNoSignal} skipped, ${summary.counts.signalsDetected} signals, ` +
      `${summary.catalog.rubricsApplied.length} rubrics, ${summary.llmCalls.count} LLM calls, ` +
      `$${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
}
