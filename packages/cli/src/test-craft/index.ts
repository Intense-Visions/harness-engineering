/**
 * test-craft orchestrator — fourth member of the craft-pipeline initiative
 * (#3 of 10). LLM-judgment skill that critiques test quality across
 * vitest / jest / mocha / playwright.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import { detectFramework } from './extract/framework.js';
import { extractTests } from './extract/tests.js';
import { resolveSourceFile } from './extract/source-pair.js';
import { SEED_RUBRICS, type TestRubric } from './catalog/rubrics/index.js';
import { critiqueOne } from './phases/critique.js';
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
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_TESTS_PER_FILE = 20;
const TEST_FILE_EXTS = [
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.jsx',
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
  '.spec.jsx',
];

export async function runTestCraft(input: TestCraftInput): Promise<TestCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxTestsPerFile = input.maxTestsPerFile ?? DEFAULT_MAX_TESTS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();
  const rubrics = SEED_RUBRICS;
  const sourcePairEnabled = input.sourcePair !== false;
  const frameworksFilter = input.frameworks !== undefined ? new Set(input.frameworks) : null;

  const files = collectTestFiles(projectRoot, input.files).slice(0, maxFiles);

  const allTests: ExtractedTest[] = [];
  const frameworksDetected: Record<TestFramework, number> = {
    vitest: 0,
    jest: 0,
    mocha: 0,
    playwright: 0,
    unknown: 0,
  };
  let testsSkippedOrTodo = 0;
  let sourcePairedCount = 0;
  const sourcePairCache = new Map<string, ReturnType<typeof resolveSourceFile>>();

  for (const file of files) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const framework = detectFramework(source);
    if (frameworksFilter !== null && !frameworksFilter.has(framework)) continue;
    frameworksDetected[framework]++;

    const extracted = extractTests({ file, source, framework });
    // Cap per-file at maxTestsPerFile
    const capped = extracted.slice(0, maxTestsPerFile);
    for (const test of capped) {
      if (test.todo) {
        testsSkippedOrTodo++;
        continue;
      }
      allTests.push(test);
    }

    if (sourcePairEnabled && !sourcePairCache.has(file)) {
      const result = resolveSourceFile(file);
      sourcePairCache.set(file, result);
      if (result !== null) sourcePairedCount++;
    }
  }

  // Critique loop
  const findings: TestFinding[] = [];
  for (const test of allTests) {
    const pair = sourcePairEnabled ? (sourcePairCache.get(test.file) ?? null) : null;
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
        /* swallow per-(test, rubric) errors */
      }
    }
  }

  const totalCost = sumCosts(provider);
  return {
    findings,
    summary: {
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
        testsExtracted: allTests.length,
        testsSkippedOrTodo,
        sourcePaired: sourcePairedCount,
      },
      frameworksDetected,
      runId: randomUUID(),
    },
  };
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
  const framework = detectFramework(source);
  if (opts.frameworks !== undefined && !opts.frameworks.includes(framework)) return [];
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const tests = extractTests({ file, source, framework })
    .filter((t) => !t.todo)
    .slice(0, opts.maxTests ?? DEFAULT_MAX_TESTS_PER_FILE);

  const pair = opts.sourcePair !== false ? resolveSourceFile(file) : null;

  const findings: TestFinding[] = [];
  for (const test of tests) {
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
        /* swallow */
      }
    }
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
      entry.name === 'coverage'
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, depth + 1);
    else if (entry.isFile() && TEST_FILE_EXTS.some((ext) => entry.name.endsWith(ext))) {
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
