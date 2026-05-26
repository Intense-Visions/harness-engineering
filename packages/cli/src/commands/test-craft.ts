/**
 * `harness test-craft` — CLI entry for test-craft (craft-pipeline #3).
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Surface area → CLI).
 */

import { Command } from 'commander';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  runTestCraft,
  type TestCraftInput,
  type TestCraftOutput,
  type TestFramework,
} from '../test-craft/index.js';

interface TestCraftCliOptions {
  files?: string[];
  frameworks?: string[];
  maxFiles?: string;
  maxTestsPerFile?: string;
  noSourcePair?: boolean;
}

export function createTestCraftCommand(): Command {
  return new Command('test-craft')
    .description(
      'LLM-judgment critique of test quality across vitest/jest/mocha/playwright. ' +
        'Fourth craft-pipeline ceiling skill. Per-test critique with best-effort source pairing.'
    )
    .option('-f, --files <files...>', 'Optional test file/glob scope')
    .option('--frameworks <names...>', 'Restrict to: vitest / jest / mocha / playwright')
    .option('--max-files <n>', 'Cap test file count (default: 100)')
    .option('--max-tests-per-file <n>', 'Cap per-file test critique (default: 20)')
    .option('--no-source-pair', 'Skip source-pairing resolution')
    .action(async (opts: TestCraftCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input: TestCraftInput = { path: cwd };
      if (opts.files !== undefined) input.files = opts.files;
      if (opts.frameworks !== undefined) input.frameworks = opts.frameworks as TestFramework[];
      if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
      if (opts.maxTestsPerFile !== undefined)
        input.maxTestsPerFile = parseInt(opts.maxTestsPerFile, 10);
      if (opts.noSourcePair === true) input.sourcePair = false;

      let result: TestCraftOutput;
      try {
        result = await runTestCraft(input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (outputMode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(`test-craft failed: ${message}`);
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
  result: TestCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log('No test findings.');
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
        const nestingStr = f.target.nesting.length > 0 ? f.target.nesting.join(' > ') + ' > ' : '';
        console.log(
          `  ${f.code} [${f.tier}/${f.impact}/${f.confidence}] ${f.target.framework}:${f.target.line}`
        );
        console.log(`    ${nestingStr}${f.target.testName}`);
        console.log(`    ${f.message}`);
        if (verbose) console.log(`    source: ${f.cite.source}`);
      }
    }
  }

  console.log('');
  const frameworksStr = Object.entries(summary.frameworksDetected)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(', ');
  console.log(
    `Summary: ${findings.length} findings across ${summary.counts.testsExtracted} tests ` +
      `(${summary.counts.filesScanned} files, frameworks: ${frameworksStr || 'none'}, ` +
      `paired: ${summary.counts.sourcePaired}, ` +
      `${summary.llmCalls.count} LLM calls, $${summary.llmCalls.costUsd.toFixed(4)}, ${summary.durationMs}ms)`
  );
}
