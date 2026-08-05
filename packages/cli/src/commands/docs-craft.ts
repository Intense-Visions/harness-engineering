/**
 * `harness docs-craft` — CLI entry for docs-craft, the documentation member of
 * the craft-pipeline initiative.
 *
 * Source: docs/changes/docs-craft/proposal.md (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { runDocsCraft, type DocsCraftInput, type DocsCraftOutput } from '../docs-craft/index.js';

interface DocsCraftCliOptions {
  files?: string[];
  excludeDirs?: string[];
  maxFiles?: string;
}

export function createDocsCraftCommand(): Command {
  return new Command('docs-craft')
    .description(
      'LLM-judgment critique of documentation quality — the ceiling counterpart to the ' +
        'rule-based doc floor (detect-doc-drift / check-docs / docs-pipeline). 7 seed rubrics ' +
        '(teaches-not-describes, order-matches-mental-model, examples-earn-their-place, ' +
        'prose-is-alive, api-doc-predicts-response, stranger-same-understanding, ' +
        'scannable-and-navigable). Per-file critique.'
    )
    .option('-f, --files <files...>', 'Optional file scope (overrides docs/ discovery)')
    .option('--exclude-dirs <dirs...>', 'Additional subdir names to skip under docs/')
    .option('--max-files <n>', 'Cap doc count (default: 60)')
    .action(runAction);
}

function buildInput(cwd: string, opts: DocsCraftCliOptions): DocsCraftInput {
  const input: DocsCraftInput = { path: cwd };
  if (opts.files !== undefined) input.files = opts.files;
  if (opts.excludeDirs !== undefined) input.excludeDirs = opts.excludeDirs;
  if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
  return input;
}

async function runAction(opts: DocsCraftCliOptions, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  const outputMode = resolveOutputMode(globalOpts);
  const formatter = new OutputFormatter(outputMode);
  const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

  let result: DocsCraftOutput;
  try {
    result = await runDocsCraft(buildInput(cwd, opts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (outputMode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: message }));
    } else {
      logger.error(`docs-craft failed: ${message}`);
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
  result: DocsCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No documentation-craft findings.');
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
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.relative} (${f.target.kind})`
        );
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${findings.length} findings across ${summary.counts.filesScanned} docs ` +
      `(${summary.counts.filesSkipped} skipped, ${summary.catalog.rubricsApplied.length} rubrics, ` +
      `${summary.catalog.exemplarsAvailable} exemplars, ${summary.llmCalls.count} LLM calls, ` +
      `$${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
}
