/**
 * test-craft orchestrator — fourth member of the craft-pipeline initiative
 * (#3 of 10). LLM-judgment skill that critiques test quality across
 * vitest / jest / mocha / playwright / pytest.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import {
  getProvider,
  InSessionLlmProvider,
  type LlmProvider,
} from '../shared/craft/llm/provider.js';
import { detectFramework } from './extract/framework.js';
import { extractTests } from './extract/tests.js';
import { extractPythonTests, isPythonTestFile } from './extract/python-tests.js';
import { isTsJsTestFileName } from './extract/test-file-exts.js';
import { resolveSourceFile } from './extract/source-pair.js';
import { SEED_RUBRICS, type TestRubric } from './catalog/rubrics/index.js';
import { critiqueOne } from './phases/critique.js';
import { emitTestCraftReport } from './emit.js';
import type {
  TestCraftOutput,
  TestFinding,
  TestFramework,
  ExtractedTest,
} from './findings/schema.js';

export interface TestCraftInput {
  path: string;
  files?: string[];
  frameworks?: TestFramework[];
  maxFiles?: number;
  maxTestsPerFile?: number;
  sourcePair?: boolean;
  /**
   * When set, write a machine-readable per-test verdict report (issue #914)
   * to this path so downstream tooling can consume the 8-axis findings instead
   * of losing them to chat. Relative paths resolve against the project root.
   */
  emitTo?: string;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_TESTS_PER_FILE = 20;

/**
 * `InSessionLlmProvider.callText` throws `PromptDeferredError` unconditionally
 * — it queues the prompt for the calling agent rather than answering it. There
 * is no two-step collect/finalize flow for test-craft yet, so with that
 * provider every (test, rubric) critique throws and the command reports a
 * confident `No test findings.` Refuse up front instead, the way naming-craft
 * already does (issue #1346).
 */
function assertProviderCanAnswer(provider: LlmProvider, entryPoint: string): void {
  if (!(provider instanceof InSessionLlmProvider)) return;
  throw new Error(
    `${entryPoint} cannot run against the in-session provider: it defers every ` +
      'prompt to the calling agent, so no rubric would actually be evaluated ' +
      'and the run would report zero findings for zero critiques. Configure a ' +
      'real backend via agent.backends + HARNESS_CRAFT_LLM, or set ' +
      'HARNESS_CRAFT_LLM=mock for tests.'
  );
}
// Extension list lives in extract/test-file-exts.ts, shared with the extractor.
// Keeping a private copy here is what let the two drift and produce a
// `filesScanned: 1 / testsExtracted: 0` run (issue #1347).

/** True when the file name matches a supported test-file naming convention. */
function isTestFileName(name: string): boolean {
  return isTsJsTestFileName(name) || isPythonTestFile(name);
}

/** Dispatch extraction by language: Python → light-parse, TS/JS → AST. */
function extractTestsForFile(
  file: string,
  source: string,
  framework: TestFramework
): ExtractedTest[] {
  if (file.endsWith('.py')) return extractPythonTests({ file, source });
  return extractTests({ file, source, framework });
}

export async function runTestCraft(input: TestCraftInput): Promise<TestCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTestsPerFile = input.maxTestsPerFile ?? DEFAULT_MAX_TESTS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();
  assertProviderCanAnswer(provider, 'runTestCraft');
  const rubrics = SEED_RUBRICS;
  const sourcePairEnabled = input.sourcePair !== false;
  const frameworksFilter = input.frameworks !== undefined ? new Set(input.frameworks) : null;

  const files = collectTestFiles(projectRoot, input.files).slice(0, maxFiles);

  const extraction = extractTestsFromFiles(files, {
    frameworksFilter,
    maxTestsPerFile,
    sourcePairEnabled,
  });

  // Critique loop
  const findings: TestFinding[] = [];
  let critiqueErrors = 0;
  for (const test of extraction.allTests) {
    const pair = sourcePairEnabled ? (extraction.sourcePairCache.get(test.file) ?? null) : null;
    const result = await critiqueTest(test, rubrics, provider, pair);
    findings.push(...result.findings);
    critiqueErrors += result.errors;
  }

  const output: TestCraftOutput = {
    findings,
    summary: buildSummary({ provider, rubrics, files, extraction, startedAt, critiqueErrors }),
  };

  await maybeEmitReport(output, input.emitTo, projectRoot);
  return output;
}

/** Assemble the run summary. Extracted to keep runTestCraft under the complexity floor. */
function buildSummary(args: {
  provider: LlmProvider;
  rubrics: ReadonlyArray<TestRubric>;
  files: readonly string[];
  extraction: ExtractionResult;
  startedAt: number;
  critiqueErrors: number;
}): TestCraftOutput['summary'] {
  const { provider, rubrics, files, extraction, startedAt, critiqueErrors } = args;
  const totalCost = sumCosts(provider);
  return {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs: Date.now() - startedAt,
    llmCalls: {
      provider: provider.providerId,
      model: provider.model,
      count: totalCost.count,
      costUsd: totalCost.costUsd,
    },
    catalog: { rubricsApplied: rubrics.map((r) => r.id) },
    counts: {
      filesScanned: files.length,
      testsExtracted: extraction.allTests.length,
      testsSkippedOrTodo: extraction.testsSkippedOrTodo,
      sourcePaired: extraction.sourcePairedCount,
      critiqueErrors,
      testsTruncated: extraction.testsTruncated,
    },
    frameworksDetected: extraction.frameworksDetected,
    runId: randomUUID(),
  };
}

/** Write the machine-readable verdict report when an emit path is configured (issue #914). */
async function maybeEmitReport(
  output: TestCraftOutput,
  emitTo: string | undefined,
  projectRoot: string
): Promise<void> {
  if (emitTo === undefined || emitTo.length === 0) return;
  const target = path.isAbsolute(emitTo) ? emitTo : path.join(projectRoot, emitTo);
  await emitTestCraftReport(output, target);
}

interface ExtractionResult {
  allTests: ExtractedTest[];
  frameworksDetected: Record<TestFramework, number>;
  testsSkippedOrTodo: number;
  sourcePairedCount: number;
  testsTruncated: number;
  sourcePairCache: Map<string, ReturnType<typeof resolveSourceFile>>;
}

/** Read a file, returning null when it cannot be read. */
function readFileOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

/** Push non-todo tests onto `out`, returning the count of skipped/todo tests. */
function collectNonTodoTests(tests: readonly ExtractedTest[], out: ExtractedTest[]): number {
  let skipped = 0;
  for (const test of tests) {
    if (test.todo) skipped++;
    else out.push(test);
  }
  return skipped;
}

/** Walk the candidate test files, extracting tests and source-pair metadata. */
function extractTestsFromFiles(
  files: readonly string[],
  opts: {
    frameworksFilter: Set<TestFramework> | null;
    maxTestsPerFile: number;
    sourcePairEnabled: boolean;
  }
): ExtractionResult {
  const allTests: ExtractedTest[] = [];
  const frameworksDetected: Record<TestFramework, number> = {
    vitest: 0,
    jest: 0,
    mocha: 0,
    playwright: 0,
    pytest: 0,
    unknown: 0,
  };
  let testsSkippedOrTodo = 0;
  let sourcePairedCount = 0;
  let testsTruncated = 0;
  const sourcePairCache = new Map<string, ReturnType<typeof resolveSourceFile>>();

  for (const file of files) {
    const source = readFileOrNull(file);
    if (source === null) continue;
    const framework = detectFramework(source, file);
    if (opts.frameworksFilter !== null && !opts.frameworksFilter.has(framework)) continue;
    frameworksDetected[framework]++;

    // Cap per-file at maxTestsPerFile, recording what the cap discarded so the
    // summary cannot present a truncated count as the population (issue #1347).
    const extracted = extractTestsForFile(file, source, framework);
    const capped = extracted.slice(0, opts.maxTestsPerFile);
    testsTruncated += extracted.length - capped.length;
    testsSkippedOrTodo += collectNonTodoTests(capped, allTests);

    if (opts.sourcePairEnabled && !sourcePairCache.has(file)) {
      const result = resolveSourceFile(file);
      sourcePairCache.set(file, result);
      if (result !== null) sourcePairedCount++;
    }
  }

  return {
    allTests,
    frameworksDetected,
    testsSkippedOrTodo,
    sourcePairedCount,
    testsTruncated,
    sourcePairCache,
  };
}

interface CritiqueTally {
  findings: TestFinding[];
  /** Rubrics whose critique threw. Counted, never silently discarded (#1346). */
  errors: number;
}

/**
 * Critique a single test against every rubric. One bad LLM call shouldn't sink
 * the run, so per-rubric errors are still tolerated — but they are COUNTED and
 * surfaced in the summary. Discarding them outright made a total failure and a
 * clean result indistinguishable.
 */
async function critiqueTest(
  test: ExtractedTest,
  rubrics: ReadonlyArray<TestRubric>,
  provider: LlmProvider,
  pair: ReturnType<typeof resolveSourceFile> | null
): Promise<CritiqueTally> {
  const findings: TestFinding[] = [];
  let errors = 0;
  for (const rubric of rubrics) {
    try {
      const finding = await critiqueOne({
        test,
        rubric,
        provider,
        ...(pair !== null ? { sourcePair: pair } : {}),
      });
      if (finding !== null) findings.push(finding);
    } catch {
      errors++;
    }
  }
  return { findings, errors };
}

/**
 * Cross-cutting entry: critique tests in a single file without project walk.
 */
export async function critiqueTestsInFile(
  file: string,
  opts: {
    source?: string;
    frameworks?: TestFramework[];
    rubrics?: ReadonlyArray<TestRubric>;
    provider?: LlmProvider;
    sourcePair?: boolean;
    maxTests?: number;
  } = {}
): Promise<TestFinding[]> {
  const source = opts.source ?? fs.readFileSync(file, 'utf-8');
  const framework = detectFramework(source, file);
  if (opts.frameworks !== undefined && !opts.frameworks.includes(framework)) return [];
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  assertProviderCanAnswer(provider, 'critiqueTestsInFile');
  const tests = extractTestsForFile(file, source, framework)
    .filter((t) => !t.todo)
    .slice(0, opts.maxTests ?? DEFAULT_MAX_TESTS_PER_FILE);

  const pair = opts.sourcePair !== false ? resolveSourceFile(file) : null;

  const findings: TestFinding[] = [];
  for (const test of tests) {
    findings.push(...(await critiqueTest(test, rubrics, provider, pair)).findings);
  }
  return findings;
}

function collectTestFiles(
  projectRoot: string,
  explicitFiles: readonly string[] | undefined
): string[] {
  if (explicitFiles !== undefined && explicitFiles.length > 0) {
    return explicitFiles.map((f) => (path.isAbsolute(f) ? f : path.join(projectRoot, f)));
  }
  const out: string[] = [];
  walk(projectRoot, out, 0);
  return out;
}

function walk(dir: string, out: string[], depth: number): void {
  if (depth > 10) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'build' ||
      entry.name === 'coverage' ||
      entry.name === '__pycache__' ||
      entry.name === 'venv' ||
      entry.name === 'vendor'
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, depth + 1);
    else if (entry.isFile() && isTestFileName(entry.name)) {
      out.push(full);
    }
  }
}

interface CostSummary {
  count: number;
  costUsd: number;
}

function sumCosts(provider: LlmProvider): CostSummary {
  const maybeGetCosts = (provider as unknown as { getCosts?: () => readonly { costUsd: number }[] })
    .getCosts;
  if (typeof maybeGetCosts !== 'function') return { count: 0, costUsd: 0 };
  const costs = maybeGetCosts.call(provider);
  return {
    count: costs.length,
    costUsd: costs.reduce((sum, c) => sum + c.costUsd, 0),
  };
}

export type {
  TestFinding,
  TestCraftOutput,
  TestFramework,
  ExtractedTest,
} from './findings/schema.js';
export {
  buildTestCraftReport,
  emitTestCraftReport,
  toTestVerdicts,
  TEST_CRAFT_REPORT_SCHEMA,
  TEST_CRAFT_REPORT_VERSION,
} from './emit.js';
export type { TestCraftReport, TestVerdict } from './emit.js';
