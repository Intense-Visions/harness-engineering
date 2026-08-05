/**
 * `harness code-craft` — CLI entry for code-craft, the code-quality member of
 * the craft-pipeline initiative.
 *
 * Source: docs/changes/code-craft/proposal.md (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { runCodeCraft, type CodeCraftInput, type CodeCraftOutput } from '../code-craft/index.js';

interface CodeCraftCliOptions {
  files?: string[];
  packages?: string[];
  maxFiles?: string;
  maxUnitsPerFile?: string;
}

export function createCodeCraftCommand(): Command {
  return new Command('code-craft')
    .description(
      'LLM-judgment critique of code quality / readability — the ceiling counterpart to the ' +
        'rule-based code floor (entropy-cleaner / enforce-architecture / complexity thresholds). ' +
        '7 seed rubrics (reveals-intent, control-flow-honest, one-story-one-altitude, ' +
        'abstraction-earns-keep, simplest-it-could-be, signature-keeps-promise, ' +
        'senior-nods-not-winces). Per-unit critique of functions, methods, and classes. ' +
        'Identifier-level naming is delegated to naming-craft.'
    )
    .option('-f, --files <files...>', 'Optional file scope (overrides packages/*/src discovery)')
    .option('--packages <names...>', 'Restrict to specific packages under packages/')
    .option('--max-files <n>', 'Cap source-file count (default: 100)')
    .option('--max-units-per-file <n>', 'Cap per-file unit critique (default: 20)')
    .action(runAction);
}

function buildInput(cwd: string, opts: CodeCraftCliOptions): CodeCraftInput {
  const input: CodeCraftInput = { path: cwd };
  if (opts.files !== undefined) input.files = opts.files;
  if (opts.packages !== undefined) input.packages = opts.packages;
  if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
  if (opts.maxUnitsPerFile !== undefined) {
    input.maxUnitsPerFile = parseInt(opts.maxUnitsPerFile, 10);
  }
  return input;
}

async function runAction(opts: CodeCraftCliOptions, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  const outputMode = resolveOutputMode(globalOpts);
  const formatter = new OutputFormatter(outputMode);
  const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

  let result: CodeCraftOutput;
  try {
    result = await runCodeCraft(buildInput(cwd, opts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (outputMode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: message }));
    } else {
      logger.error(`code-craft failed: ${message}`);
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
}

function printResult(
  result: CodeCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No code-craft findings.');
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
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.kind} ${f.target.unit}:${f.target.line}`
        );
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${findings.length} findings across ${summary.counts.filesScanned} files ` +
      `(${summary.counts.filesSkippedNoUnit} skipped, ${summary.counts.unitsDetected} units, ` +
      `${summary.catalog.rubricsApplied.length} rubrics, ${summary.catalog.exemplarsAvailable} exemplars, ` +
      `${summary.llmCalls.count} LLM calls, $${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
}
