/**
 * `harness align-design-system` — CLI entry for the align skill
 * (design-pipeline sub-project #1, align half). Mirrors `harness check-docs`
 * in shape: thin command layer over the runAlignDesignSystem orchestrator.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runAlignDesignSystem,
  type AlignInput,
  type AlignDesignSystemOutput,
  type FixOutcome,
} from '../align/index.js';
import type { DriftStrictness } from '../drift/findings/finding.js';

interface AlignCliOptions {
  dryRun?: boolean;
  files?: string[];
  mode?: 'standalone' | 'pipeline';
  designStrictness?: DriftStrictness;
  revert?: boolean;
}

export function createAlignDesignSystemCommand(): Command {
  return new Command('align-design-system')
    .description(
      'Apply codemods for safe DRIFT-T001/T002/T003 findings and emit suggestions ' +
        'for DRIFT-T004 + all DRIFT-P*. Runs standalone (invokes detect-design-drift ' +
        'internally) or pipeline (reads pipeline.driftFindings from .harness/handoff.json).'
    )
    .option('--dry-run', 'Compute diffs without writing files. Default: write.')
    .option(
      '-f, --files <files...>',
      'Optional file/glob scope (standalone mode only — passed to detect-design-drift).'
    )
    .option(
      '--mode <mode>',
      'standalone (default) or pipeline (read findings from handoff.json)',
      'standalone'
    )
    .option(
      '--design-strictness <level>',
      'Override design.strictness: strict | standard | permissive'
    )
    .option(
      '--revert',
      'Inverse-apply the most-recent batch recorded at .harness/align/last-batch.json. ' +
        'Skips files edited externally since the apply.'
    )
    .action(async (opts: AlignCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: AlignInput = { path: cwd };
      if (opts.dryRun === true) input.dryRun = true;
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.mode !== undefined) input.mode = opts.mode;
      if (opts.designStrictness !== undefined) input.designStrictness = opts.designStrictness;
      if (opts.revert === true) input.revert = true;

      let result: AlignDesignSystemOutput;
      try {
        result = await runAlignDesignSystem(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`align-design-system failed: ${message}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }

      if (outputMode === OutputMode.JSON) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printAlignResult(result, outputMode, formatter);
      }

      if (result.summary.failed > 0) process.exit(ExitCode.ERROR);
      process.exit(ExitCode.SUCCESS);
    });
}

function printAlignResult(
  result: AlignDesignSystemOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { summary, outcomes, meta } = result;

  if (outcomes.length === 0) {
    if (meta.revert === true) {
      console.log('No batch to revert (.harness/align/last-batch.json missing or empty).');
    } else {
      console.log('No drift findings to align.');
    }
    return;
  }

  // Group by file for readable output
  const byFile = new Map<string, FixOutcome[]>();
  for (const o of outcomes) {
    const file = outcomeFile(o);
    const list = byFile.get(file) ?? [];
    list.push(o);
    byFile.set(file, list);
  }

  for (const [file, fixes] of byFile) {
    console.log(`\n${file}`);
    for (const o of fixes) {
      const icon = outcomeIcon(o.kind);
      const line =
        o.finding.line !== null && o.finding.line !== undefined ? `:${o.finding.line}` : '';
      console.log(`  ${icon} ${o.finding.code}${line} — ${o.finding.message}`);
      if (o.kind === 'applied') {
        console.log(`     before: ${o.diff.before.trim()}`);
        console.log(`     after:  ${o.diff.after.trim()}`);
      } else if (o.kind === 'suggestion' && verbose) {
        console.log(`     suggest: ${o.suggestion.description}`);
      } else if (o.kind === 'skipped-unsafe' && verbose) {
        console.log(`     skipped: ${o.reason}`);
      } else if (o.kind === 'failed') {
        console.log(`     error: ${o.error}`);
      }
    }
  }

  console.log('');
  const action = meta.revert === true ? 'reverted' : 'applied';
  console.log(
    `Summary: ${summary.applied} ${action}, ${summary.suggestions} suggestions, ` +
      `${summary.skipped} skipped, ${summary.failed} failed ` +
      `(${summary.filesModified} files modified, ${summary.durationMs}ms)`
  );
  if (meta.dryRun) {
    console.log('(dry-run — no files written)');
  }
}

function outcomeFile(o: FixOutcome): string {
  if (o.kind === 'applied') return o.diff.file;
  return o.finding.file;
}

function outcomeIcon(kind: FixOutcome['kind']): string {
  switch (kind) {
    case 'applied':
      return '✓';
    case 'suggestion':
      return '?';
    case 'skipped-unsafe':
      return '·';
    case 'failed':
      return '✗';
  }
}
