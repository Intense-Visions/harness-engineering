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
  emit?: string;
}

export function createTestCraftCommand(): Command {
  return new Command('test-craft')
    .description(
      'LLM-judgment critique of test quality across vitest/jest/mocha/playwright/pytest. ' +
        'Fourth craft-pipeline ceiling skill. Per-test critique with best-effort source pairing.'
    )
    .option('-f, --files <files...>', 'Optional test file/glob scope')
    .option('--frameworks <names...>', 'Restrict to: vitest / jest / mocha / playwright / pytest')
    .option('--max-files <n>', 'Cap test file count (default: 100)')
    .option('--max-tests-per-file <n>', 'Cap per-file test critique (default: 20)')
    .option('--no-source-pair', 'Skip source-pairing resolution')
    .option(
      '--emit <path>',
      'Write a machine-readable per-test verdict report (JSON) to this path for downstream tooling'
    )
    .action(async (opts: TestCraftCliOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const outputMode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(outputMode);
      const cwd = (globalOpts.cwd as string | undefined) ?? process.cwd();

      const input = buildInput(opts, cwd);

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

/** Map parsed CLI options onto a TestCraftInput. Extracted to keep the action handler small. */
function buildInput(opts: TestCraftCliOptions, cwd: string): TestCraftInput {
  const input: TestCraftInput = { path: cwd };
  if (opts.files !== undefined) input.files = opts.files;
  if (opts.frameworks !== undefined) input.frameworks = opts.frameworks as TestFramework[];
  if (opts.maxFiles !== undefined) input.maxFiles = parseInt(opts.maxFiles, 10);
  if (opts.maxTestsPerFile !== undefined)
    input.maxTestsPerFile = parseInt(opts.maxTestsPerFile, 10);
  if (opts.noSourcePair === true) input.sourcePair = false;
  if (opts.emit !== undefined) input.emitTo = opts.emit;
  return input;
}

function printResult(
  result: TestCraftOutput,
  mode: OutputModeType,
  _formatter: OutputFormatter
): void {
  const verbose = mode === OutputMode.VERBOSE;
  const { findings, summary } = result;

  if (findings.length === 0) {
    // An empty result is only a pass when critiques actually ran. Say which
    // one this is rather than letting an unmeasured run read as a clean one.
    if (summary.counts.testsExtracted === 0) {
      console.log('No tests found to critique.');
    } else if (summary.llmCalls.count === 0) {
      console.log(
        `ABSTAINED: ${summary.counts.testsExtracted} test(s) extracted but 0 critiques ran — ` +
          'this is not a pass. Check the LLM backend configuration.'
      );
    } else {
      console.log('No test findings.');
    }
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

  // Anything that narrowed coverage gets said out loud — a silently truncated
  // or partly-failed run otherwise presents as a full one.
  if (summary.counts.critiqueErrors > 0) {
    console.log(
      `WARNING: ${summary.counts.critiqueErrors} critique(s) failed and were discarded; ` +
        'those (test, rubric) pairs are unmeasured.'
    );
  }
  if (summary.counts.testsTruncated > 0) {
    console.log(
      `WARNING: ${summary.counts.testsTruncated} test(s) dropped by --max-tests-per-file; ` +
        `"${summary.counts.testsExtracted} tests" is a cap, not the population.`
    );
  }
  if (summary.counts.filesScanned > 0 && summary.counts.sourcePaired === 0) {
    console.log(
      'NOTE: no test file resolved to a source file, so TEST-R007 ' +
        '(contract-not-implementation) had no contract to compare against.'
    );
  }
}
