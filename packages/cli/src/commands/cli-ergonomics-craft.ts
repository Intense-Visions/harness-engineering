/**
 * `harness cli-ergonomics-craft` — CLI entry for cli-ergonomics-craft, the
 * command-line-quality member of the craft-pipeline initiative.
 *
 * Source: docs/changes/cli-ergonomics-craft/proposal.md (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runCliErgonomicsCraft,
  type CliErgonomicsCraftInput,
  type CliErgonomicsCraftOutput,
} from '../cli-ergonomics-craft/index.js';

interface CliErgonomicsCraftCliOptions {
  files?: string[];
  commandsDir?: string;
  excludeDirs?: string[];
  maxFiles?: string;
}

export function createCliErgonomicsCraftCommand(): Command {
  return new Command('cli-ergonomics-craft')
    .description(
      'LLM-judgment critique of CLI ergonomics quality — the ceiling questions a mechanical ' +
        'check cannot ask. 7 seed rubrics (names-are-predictable, help-is-task-oriented, ' +
        'errors-are-actionable, defaults-are-sane, output-is-scannable, ' +
        'composes-with-other-tools, destructive-actions-are-guarded). Critiques a project’s ' +
        'own command definitions per file.'
    )
    .option('-f, --files <files...>', 'Optional file scope (overrides command discovery)')
    .option('--commands-dir <dir>', 'Directory of command definitions to critique')
    .option('--exclude-dirs <dirs...>', 'Additional subdir names to skip while walking')
    .option('--max-files <n>', 'Cap command count (default: 60)')
    .action(runAction);
}

function buildInput(cwd: string, opts: CliErgonomicsCraftCliOptions): CliErgonomicsCraftInput {
  const input: CliErgonomicsCraftInput = { path: cwd };
  if (opts.files !== undefined) input.files = opts.files;
  if (opts.commandsDir !== undefined) input.commandsDir = opts.commandsDir;
  if (opts.excludeDirs !== undefined) input.excludeDirs = opts.excludeDirs;
  if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
  return input;
}

async function runAction(opts: CliErgonomicsCraftCliOptions, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  const outputMode = resolveOutputMode(globalOpts);
  const formatter = new OutputFormatter(outputMode);
  const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

  let result: CliErgonomicsCraftOutput;
  try {
    result = await runCliErgonomicsCraft(buildInput(cwd, opts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (outputMode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: message }));
    } else {
      logger.error(`cli-ergonomics-craft failed: ${message}`);
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
  result: CliErgonomicsCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No CLI-ergonomics-craft findings.');
  } else {
    const byFile = new Map<string, typeof findings>();
    for (const f of findings) {
      const list = byFile.get(f.target.file) ?? [];
      list.push(f);
      byFile.set(f.target.file, list);
    }
    for (const [file, group] of byFile) {
      console.log(`\n${file}`);
      for (const f of group) {
        console.log(
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.relative} (${f.target.kind})`
        );
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${findings.length} findings across ${summary.counts.filesScanned} commands ` +
      `(${summary.counts.filesSkipped} skipped, ${summary.catalog.rubricsApplied.length} rubrics, ` +
      `${summary.catalog.exemplarsAvailable} exemplars, ${summary.llmCalls.count} LLM calls, ` +
      `$${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
}
