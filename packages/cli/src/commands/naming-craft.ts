/**
 * `harness naming-craft` — CLI entry for naming-craft (craft-pipeline #1).
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runNamingCraft,
  type NamingCraftInput,
  type NamingCraftOutput,
  type IdentifierKind,
} from '../naming-craft/index.js';

interface NamingCraftCliOptions {
  files?: string[];
  kinds?: string[];
  maxFiles?: string;
  maxIdentifiersPerFile?: string;
}

export function createNamingCraftCommand(): Command {
  return new Command('naming-craft')
    .description(
      'LLM-judgment critique of identifier names (variables, functions, types, files). ' +
        'First craft-pipeline ceiling skill; uses curated rubric catalog from Martin/Beck/Karlton.'
    )
    .option('-f, --files <files...>', 'Optional file/glob scope')
    .option(
      '-k, --kinds <kinds...>',
      'Restrict to variable / function / type / file (default: all)'
    )
    .option('--max-files <n>', 'Cap file count (default: 100)')
    .option('--max-identifiers-per-file <n>', 'Cap per-file identifier sampling (default: 15)')
    .action(async (opts: NamingCraftCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: NamingCraftInput = { path: cwd };
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.kinds !== undefined) input.kinds = opts.kinds as IdentifierKind[];
      if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
      if (opts.maxIdentifiersPerFile !== undefined)
        input.maxIdentifiersPerFile = parseInt(opts.maxIdentifiersPerFile, 10);

      let result: NamingCraftOutput;
      try {
        result = await runNamingCraft(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`naming-craft failed: ${message}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }

      if (outputMode === OutputMode.JSON) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result, outputMode, formatter);
      }

      const hasError = result.findings.some((f) => f.tier === 'foundational');
      process.exit(hasError ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
    });
}

function printResult(
  result: NamingCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No naming findings.');
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
        const line = f.target.line !== undefined ? `:${f.target.line}` : '';
        console.log(
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.kind} ${f.target.identifier}${line}`
        );
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${findings.length} findings ` +
      `(rubrics: ${summary.catalog.rubricsApplied.length}, ` +
      `LLM calls: ${summary.llmCalls.count}, cost: $${summary.llmCalls.costUsd.toFixed(4)}, ` +
      `${summary.durationMs}ms)`
  );
  console.log(
    `Convention: vars=${summary.convention.variables ?? '?'}, funcs=${summary.convention.functions ?? '?'}, ` +
      `types=${summary.convention.types ?? '?'}, files=${summary.convention.files ?? '?'}`
  );
}
