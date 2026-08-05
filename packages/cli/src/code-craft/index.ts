/**
 * code-craft orchestrator — the code-quality member of the craft-pipeline
 * initiative. LLM-judgment ceiling skill for code readability; the ceiling
 * counterpart to the rule-based code floor (harness-entropy-cleaner for dead
 * code / drift, harness-enforce-architecture for boundaries + deps, complexity
 * thresholds).
 *
 * Walks source files, extracts the substantive units a senior reviews
 * (functions, methods, classes), and critiques each against a kind-filtered
 * rubric loop. Files with no substantive unit are skipped — the FP/cost-
 * management analogue of security-craft's zero-signal skip.
 *
 * Identifier-level naming is delegated to naming-craft (re-exported as
 * `critiqueNamesInFile`) rather than duplicated; code-craft's CODE-R006 fires
 * only when a signature's SHAPE misrepresents behavior.
 *
 * Source: docs/changes/code-craft/proposal.md
 */

import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import { discoverSourceFiles } from './extract/discover.js';
import { extractUnits } from './extract/units.js';
import { SEED_RUBRICS, rubricApplies, type CodeRubric } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import { critiqueOne } from './phases/critique.js';
import type { CodeCraftOutput, CodeFinding, CodeUnit } from './findings/schema.js';

export interface CodeCraftInput {
  path: string;
  files?: string[];
  packages?: string[];
  maxFiles?: number;
  maxUnitsPerFile?: number;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_UNITS_PER_FILE = 20;

interface RunAccumulator {
  findings: CodeFinding[];
  rubricsApplied: Set<string>;
  filesScanned: number;
  filesSkippedNoUnit: number;
  unitsDetected: number;
}

export async function runCodeCraft(input: CodeCraftInput): Promise<CodeCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxUnitsPerFile = input.maxUnitsPerFile ?? DEFAULT_MAX_UNITS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();

  const candidateFiles = collectFiles(projectRoot, input).slice(0, maxFiles);
  const acc: RunAccumulator = {
    findings: [],
    rubricsApplied: new Set<string>(),
    filesScanned: 0,
    filesSkippedNoUnit: 0,
    unitsDetected: 0,
  };

  for (const file of candidateFiles) {
    await critiqueFile(file, maxUnitsPerFile, provider, acc);
  }

  const totalCost = sumCosts(provider);
  return {
    findings: acc.findings,
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
      catalog: {
        rubricsApplied: [...acc.rubricsApplied].sort(),
        exemplarsAvailable: SEED_EXEMPLARS.length,
      },
      counts: {
        filesScanned: acc.filesScanned,
        filesSkippedNoUnit: acc.filesSkippedNoUnit,
        unitsDetected: acc.unitsDetected,
      },
      runId: randomUUID(),
    },
  };
}

/** Critique every substantive unit in one file across its applicable rubrics. */
async function critiqueFile(
  file: string,
  maxUnitsPerFile: number,
  provider: LlmProvider,
  acc: RunAccumulator
): Promise<void> {
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf-8');
  } catch {
    return;
  }
  const units = extractUnits(source, file);
  if (units.length === 0) {
    acc.filesSkippedNoUnit++;
    return;
  }
  acc.filesScanned++;
  const eligibleUnits = units.slice(0, maxUnitsPerFile);
  acc.unitsDetected += eligibleUnits.length;
  for (const unit of eligibleUnits) {
    await critiqueUnit(file, source, unit, provider, acc);
  }
}

/** Run every applicable rubric against a single unit, folding findings into `acc`. */
async function critiqueUnit(
  file: string,
  source: string,
  unit: CodeUnit,
  provider: LlmProvider,
  acc: RunAccumulator
): Promise<void> {
  for (const rubric of SEED_RUBRICS) {
    if (!rubricApplies(rubric, unit.kind)) continue;
    acc.rubricsApplied.add(rubric.id);
    try {
      const finding = await critiqueOne({ file, source, unit, rubric, provider });
      if (finding !== null) acc.findings.push(finding);
    } catch {
      /* swallow per-(unit, rubric) errors */
    }
  }
}

/**
 * Cross-cutting entry: critique a single source file without a project walk.
 * Returns `[]` for files with no substantive unit (consistent with the
 * orchestrator's skip strategy).
 */
export async function critiqueCodeInFile(
  file: string,
  opts: {
    source?: string;
    rubrics?: ReadonlyArray<CodeRubric>;
    provider?: LlmProvider;
    maxUnits?: number;
  } = {}
): Promise<CodeFinding[]> {
  const source = opts.source ?? fs.readFileSync(file, 'utf-8');
  const units = extractUnits(source, file).slice(0, opts.maxUnits ?? DEFAULT_MAX_UNITS_PER_FILE);
  if (units.length === 0) return [];
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const findings: CodeFinding[] = [];
  for (const unit of units) {
    for (const rubric of rubrics) {
      if (!rubricApplies(rubric, unit.kind)) continue;
      try {
        const finding = await critiqueOne({ file, source, unit, rubric, provider });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow */
      }
    }
  }
  return findings;
}

function collectFiles(projectRoot: string, input: CodeCraftInput): string[] {
  if (input.files !== undefined && input.files.length > 0) {
    return [...input.files];
  }
  return discoverSourceFiles(projectRoot, input.packages);
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

export type { CodeFinding, CodeCraftOutput, CodeUnit, UnitKind } from './findings/schema.js';
export type { CodeRubric } from './catalog/rubrics/index.js';
export { SEED_RUBRICS } from './catalog/rubrics/index.js';
export { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
export type { CodeExemplar } from './catalog/exemplars/index.js';

/**
 * Naming reuse (not duplication): identifier-level naming critique is
 * naming-craft's territory. code-craft re-exports its single-file entry so a
 * consumer that wants both structural and naming critique imports one module.
 */
export { critiqueNamesInFile } from '../naming-craft/index.js';
