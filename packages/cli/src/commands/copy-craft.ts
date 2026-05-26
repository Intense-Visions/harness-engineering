/**
 * `harness copy-craft` — CLI entry for copy-craft (craft-pipeline #5).
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runCopyCraft,
  type CopyCraftInput,
  type CopyCraftOutput,
  type CopySurface,
} from '../copy-craft/index.js';

interface CopyCraftCliOptions {
  files?: string[];
  surfaces?: string[];
  maxFiles?: string;
  maxItemsPerFile?: string;
  commitsSince?: string;
  prLimit?: string;
}

export function createCopyCraftCommand(): Command {
  return new Command('copy-craft')
    .description(
      'LLM-judgment critique of prose-in-code across six surfaces: error messages, log ' +
        'lines, CLI output, commit subjects, PR descriptions, code comments. Third ' +
        'craft-pipeline ceiling skill. Graceful degradation when git/gh prereqs absent.'
    )
    .option('-f, --files <files...>', 'Optional source file/glob scope')
    .option(
      '-s, --surfaces <surfaces...>',
      'Restrict to: error / log / cli-output / commit / pr-description / comment'
    )
    .option('--max-files <n>', 'Cap source file count (default: 100)')
    .option('--max-items-per-file <n>', 'Cap per-file item sampling (default: 20)')
    .option('--commits-since <when>', "Commit window (default: '1 month ago')")
    .option('--pr-limit <n>', 'PR count cap (default: 20)')
    .action(async (opts: CopyCraftCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: CopyCraftInput = { path: cwd };
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.surfaces !== undefined) input.surfaces = opts.surfaces as CopySurface[];
      if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
      if (opts.maxItemsPerFile !== undefined)
        input.maxItemsPerFile = parseInt(opts.maxItemsPerFile, 10);
      if (opts.commitsSince !== undefined) input.commitsSince = opts.commitsSince;
      if (opts.prLimit !== undefined) input.prLimit = parseInt(opts.prLimit, 10);

      let result: CopyCraftOutput;
      try {
        result = await runCopyCraft(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`copy-craft failed: ${message}`);
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
  result: CopyCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No copy findings.');
  } else {
    const bySurface = new Map<CopySurface, typeof findings>();
    for (const f of findings) {
      const list = bySurface.get(f.target.surface) ?? [];
      list.push(f);
      bySurface.set(f.target.surface, list);
    }
    for (const [surface, fs] of bySurface) {
      console.log(`\n[${surface}]`);
      for (const f of fs) {
        const line = f.target.line !== undefined ? `:${f.target.line}` : '';
        console.log(`  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.file}${line}`);
        console.log(`    "${truncate(f.target.snippet, 80)}"`);
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  const surfaceCounts = Object.entries(summary.counts)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${s}=${n}`)
    .join(', ');
  console.log(
    `Summary: ${findings.length} findings across ${surfaceCounts || 'no items'} ` +
      `(${summary.catalog.rubricsApplied.length} rubrics, ${summary.llmCalls.count} LLM calls, ` +
      `$${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
  if (summary.skippedSurfaces.length > 0) {
    console.log(`Skipped surfaces:`);
    for (const s of summary.skippedSurfaces) {
      console.log(`  - ${s.surface}: ${s.reason}`);
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
