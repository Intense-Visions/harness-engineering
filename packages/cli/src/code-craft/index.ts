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
import {
  getProvider,
  InSessionLlmProvider,
  type LlmProvider,
} from '../shared/craft/llm/provider.js';
import {
  saveRunState,
  loadRunState,
  deleteRunState,
  pruneOldRuns,
} from '../shared/craft/runs/store.js';
import { discoverSourceFiles } from './extract/discover.js';
import { extractUnits } from './extract/units.js';
import { SEED_RUBRICS, rubricApplies, type CodeRubric } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { CodeCraftOutput, CodeFinding, CodeUnit } from './findings/schema.js';

export type CodeCraftMode = 'inline' | 'in-session';

export interface CodeCraftInput {
  path: string;
  files?: string[];
  packages?: string[];
  maxFiles?: number;
  maxUnitsPerFile?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: CodeCraftMode;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_UNITS_PER_FILE = 20;
/** Projected-cost guard: max prompts collected before bailing. */
const DEFAULT_PROMPT_BUDGET = 100;

export interface CollectPromptsOutput {
  status: 'collected' | 'budget-exceeded';
  runId: string;
  pendingPrompts: Array<{
    promptId: string;
    systemPrompt: string;
    userPrompt: string;
  }>;
  projection: { promptCount: number; budget: number };
  /** Populated when status='budget-exceeded'. */
  hint?: string;
  /** Persisted to disk under .harness/craft/runs/<runId>.json. */
  runFile?: string;
}

export interface FinalizeCodeCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface CodeRunMeta {
  projectRoot: string;
  startedAt: number;
  rubricsApplied: string[];
  filesScanned: number;
  filesSkippedNoUnit: number;
  unitsDetected: number;
  /** Pairs every queued prompt to the data needed to build a finding. */
  prompts: Array<{
    promptId: string;
    file: string;
    unit: CodeUnit;
    rubricId: string;
  }>;
}

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

  if (provider instanceof InSessionLlmProvider) {
    throw new Error(
      'runCodeCraft is the inline entry point; the in-session provider ' +
        'requires the two-step flow. Call collectCodeCraftPrompts(...) and ' +
        'then finalizeCodeCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
    );
  }

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

/**
 * Step 1 of the two-step in-session flow. Walks the project, builds one
 * prompt per (unit, rubric) pair, persists run-state to disk, and returns
 * the prompts for the calling agent to answer. No LLM is called.
 */
export async function collectCodeCraftPrompts(
  input: CodeCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxUnitsPerFile = input.maxUnitsPerFile ?? DEFAULT_MAX_UNITS_PER_FILE;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const runId = randomUUID();

  const candidateFiles = collectFiles(projectRoot, input).slice(0, maxFiles);
  const promptRecords: CodeRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let filesScanned = 0;
  let filesSkippedNoUnit = 0;
  let unitsDetected = 0;

  outer: for (const file of candidateFiles) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const units = extractUnits(source, file);
    if (units.length === 0) {
      filesSkippedNoUnit++;
      continue;
    }
    filesScanned++;
    const eligibleUnits = units.slice(0, maxUnitsPerFile);
    unitsDetected += eligibleUnits.length;
    for (const unit of eligibleUnits) {
      for (const rubric of SEED_RUBRICS) {
        if (!rubricApplies(rubric, unit.kind)) continue;
        rubricsApplied.add(rubric.id);
        const promptId = `p${promptRecords.length + 1}`;
        const userPrompt = buildPrompt({ file, source, unit, rubric });
        promptRecords.push({ promptId, file, unit, rubricId: rubric.id });
        pending.push({ promptId, systemPrompt: CRITIQUE_SYSTEM_PROMPT, userPrompt });
        if (pending.length > budget) break outer;
      }
    }
  }

  if (pending.length > budget) {
    return {
      status: 'budget-exceeded',
      runId,
      pendingPrompts: [],
      projection: { promptCount: pending.length, budget },
      hint:
        `Projected at least ${pending.length} LLM prompts (budget: ${budget}). ` +
        'Re-invoke with smaller maxFiles / maxUnitsPerFile, or pass promptBudget to raise the ceiling.',
    };
  }

  const meta: CodeRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    filesScanned,
    filesSkippedNoUnit,
    unitsDetected,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<CodeRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'code-craft',
    createdAt: Date.now(),
    meta,
  });

  return {
    status: 'collected',
    runId,
    pendingPrompts: pending,
    projection: { promptCount: pending.length, budget },
    runFile,
  };
}

/**
 * Step 2 of the two-step in-session flow. Loads run-state, applies the
 * supplied responses through the same parser the inline path uses, and
 * returns the final CodeCraftOutput. Deletes the run-state file on success.
 */
export async function finalizeCodeCraft(input: FinalizeCodeCraftInput): Promise<CodeCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunState<CodeRunMeta>(projectRoot, input.runId);
  if (state === null) {
    throw new Error(
      `code-craft: no persisted run found for runId=${input.runId} under ${projectRoot}. ` +
        'Run collectCodeCraftPrompts first, or ensure the path matches the project root used at collection time.'
    );
  }
  if (state.skill !== 'code-craft') {
    throw new Error(
      `code-craft: runId=${input.runId} belongs to skill ${state.skill}, not code-craft.`
    );
  }

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: CodeFinding[] = [];

  for (const response of input.responses) {
    const promptRecord = promptById.get(response.promptId);
    if (promptRecord === undefined) continue;
    const rubric = rubricById.get(promptRecord.rubricId);
    if (rubric === undefined) continue;
    const finding = parseFindingFromRaw(response.raw, {
      file: promptRecord.file,
      unit: promptRecord.unit,
      rubric,
    });
    if (finding !== null) findings.push(finding);
  }

  deleteRunState(projectRoot, input.runId);

  return {
    findings,
    summary: {
      phaseRun: ['critique'],
      mode: 'fast',
      durationMs: Date.now() - startedAt,
      llmCalls: {
        provider: 'in-session',
        model: 'host-chat',
        count: input.responses.length,
        costUsd: 0,
      },
      catalog: {
        rubricsApplied: state.meta.rubricsApplied,
        exemplarsAvailable: SEED_EXEMPLARS.length,
      },
      counts: {
        filesScanned: state.meta.filesScanned,
        filesSkippedNoUnit: state.meta.filesSkippedNoUnit,
        unitsDetected: state.meta.unitsDetected,
      },
      runId: input.runId,
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
