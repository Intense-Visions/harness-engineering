/**
 * `harness spec-craft` — CLI entry for spec-craft (craft-pipeline #6).
 *
 * Source: docs/changes/craft-pipeline/spec-craft/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runSpecCraft,
  type SpecCraftInput,
  type SpecCraftOutput,
  type SpecKind,
} from '../spec-craft/index.js';
import { resolveCraftLlmConfig, type CraftLlmResolution } from '../shared/craft/llm/provider.js';
import { formatCraftDiagnostic, type CraftScanTally } from '../shared/craft/diagnostics.js';

interface SpecCraftCliOptions {
  files?: string[];
  kinds?: string[];
  sections?: string[];
  maxFiles?: string;
  maxSectionsPerFile?: string;
}

export function createSpecCraftCommand(): Command {
  return new Command('spec-craft')
    .description(
      'LLM-judgment critique of spec quality (proposals + ADRs). Second craft-pipeline ' +
        'ceiling skill; 7 seed rubrics from the spec-quality canon. Per-section critique.'
    )
    .option('-f, --files <files...>', 'Optional spec file/glob scope')
    .option('-k, --kinds <kinds...>', 'Restrict to proposal / adr (default: both)')
    .option('-s, --sections <names...>', 'Restrict to specific canonical section names')
    .option('--max-files <n>', 'Cap doc count (default: 50)')
    .option('--max-sections-per-file <n>', 'Cap per-doc section critique (default: 10)')
    .action(async (opts: SpecCraftCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: SpecCraftInput = { path: cwd };
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.kinds !== undefined) input.kinds = opts.kinds as SpecKind[];
      if (opts.sections !== undefined) input.sections = opts.sections;
      if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
      if (opts.maxSectionsPerFile !== undefined)
        input.maxSectionsPerFile = parseInt(opts.maxSectionsPerFile, 10);

      let result: SpecCraftOutput;
      try {
        result = await runSpecCraft(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`spec-craft failed: ${message}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }

      if (outputMode === OutputMode.JSON) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result, outputMode, formatter, resolveCraftLlmConfig({ projectRoot: cwd }));
      }

      const hasFoundational = result.findings.some((f) => f.tier === 'foundational');
      process.exit(hasFoundational ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
    });
}

function specScanTally(summary: SpecCraftOutput['summary']): CraftScanTally {
  const tally: CraftScanTally = {
    unit: 'docs',
    analyzed: summary.docsScanned,
    skipped: 0,
  };
  if (summary.docsScanned === 0) {
    tally.skipReason = 'no proposals or ADRs found in scope';
  }
  return tally;
}

function printResult(
  result: SpecCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter,
  resolution: CraftLlmResolution
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No spec findings.');
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
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ## ${f.target.section}:${f.target.line}`
        );
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  console.log(
    `Summary: ${findings.length} findings across ${summary.docsScanned} docs ` +
      `(${summary.sectionsScanned} sections, ${summary.catalog.rubricsApplied.length} rubrics, ` +
      `${summary.llmCalls.count} LLM calls, $${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
  console.log(formatCraftDiagnostic({ resolution, scan: specScanTally(summary) }));
}
