/**
 * `harness api-craft` — CLI entry for api-craft, the API-quality member of the
 * craft-pipeline initiative.
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { runApiCraft, type ApiCraftInput, type ApiCraftOutput } from '../api-craft/index.js';

interface ApiCraftCliOptions {
  files?: string[];
  routesDir?: string;
  specFile?: string;
  excludeDirs?: string[];
  maxFiles?: string;
}

export function createApiCraftCommand(): Command {
  return new Command('api-craft')
    .description(
      'LLM-judgment critique of API quality — the ceiling questions a rule-based OpenAPI check ' +
        'cannot ask. 9 seed rubrics (resource-models-the-domain, naming-is-predictable, ' +
        'verbs-are-honest, status-codes-are-correct, errors-are-actionable, ' +
        'response-shapes-are-predictable, collections-paginate-and-filter, ' +
        'mutations-are-idempotency-honest, evolves-without-breaking). Critiques a project’s own ' +
        'OpenAPI documents and route/handler definitions per file.'
    )
    .option('-f, --files <files...>', 'Optional file scope (overrides API-surface discovery)')
    .option('--routes-dir <dir>', 'Directory of route/handler definitions to critique')
    .option('--spec-file <file>', 'Explicit OpenAPI/Swagger document to critique')
    .option('--exclude-dirs <dirs...>', 'Additional subdir names to skip while walking')
    .option('--max-files <n>', 'Cap surface count (default: 60)')
    .action(runAction);
}

function buildInput(cwd: string, opts: ApiCraftCliOptions): ApiCraftInput {
  const input: ApiCraftInput = { path: cwd };
  if (opts.files !== undefined) input.files = opts.files;
  if (opts.routesDir !== undefined) input.routesDir = opts.routesDir;
  if (opts.specFile !== undefined) input.specFile = opts.specFile;
  if (opts.excludeDirs !== undefined) input.excludeDirs = opts.excludeDirs;
  if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
  return input;
}

async function runAction(opts: ApiCraftCliOptions, cmd: Command): Promise<void> {
  const globalOpts = cmd.optsWithGlobals();
  const outputMode = resolveOutputMode(globalOpts);
  const formatter = new OutputFormatter(outputMode);
  const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

  let result: ApiCraftOutput;
  try {
    result = await runApiCraft(buildInput(cwd, opts));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (outputMode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: message }));
    } else {
      logger.error(`api-craft failed: ${message}`);
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
  result: ApiCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No API-craft findings.');
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
    `Summary: ${findings.length} findings across ${summary.counts.filesScanned} API surfaces ` +
      `(${summary.counts.filesSkipped} skipped, ${summary.catalog.rubricsApplied.length} rubrics, ` +
      `${summary.catalog.exemplarsAvailable} exemplars, ${summary.llmCalls.count} LLM calls, ` +
      `$${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
}
