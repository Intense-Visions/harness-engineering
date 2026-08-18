/**
 * security-craft orchestrator — sixth non-design member of the
 * craft-pipeline initiative (#10 of 10; the final sub-project). Walks
 * source files, detects AST-driven security signals, critiques only
 * files with signals using a conservative-confidence rubric loop.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
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
  loadRunStateOrThrow,
  deleteRunState,
  pruneOldRuns,
} from '../shared/craft/runs/store.js';
import { discoverSourceFiles } from './extract/discover.js';
import { detectSignals } from './extract/signals.js';
import { SEED_RUBRICS, rubricApplies, type SecurityRubric } from './catalog/rubrics/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { SecurityCraftOutput, SecurityFinding, SecuritySignal } from './findings/schema.js';

export type SecurityCraftMode = 'inline' | 'in-session';

export interface SecurityCraftInput {
  path: string;
  files?: string[];
  packages?: string[];
  maxFiles?: number;
  maxSignalsPerFile?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: SecurityCraftMode;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_SIGNALS_PER_FILE = 10;
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

export interface FinalizeSecurityCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface SecurityRunMeta {
  projectRoot: string;
  startedAt: number;
  rubricsApplied: string[];
  filesScanned: number;
  filesSkippedNoSignal: number;
  signalsDetected: number;
  /** Pairs every queued prompt to the data needed to build a finding. */
  prompts: Array<{
    promptId: string;
    file: string;
    signal: SecuritySignal;
    rubricId: string;
  }>;
}

/**
 * `InSessionLlmProvider.callText` throws `PromptDeferredError` on every call —
 * it defers the prompt to the calling agent rather than answering it. There is
 * no two-step collect/finalize flow for this craft, so with that provider every
 * per-(target, rubric) critique throws and the bare `catch {}` swallows it,
 * leaving a confident zero-findings run for zero completed critiques. Refuse up
 * front instead, the way naming-craft and test-craft already do (issue #1368).
 */
function assertProviderCanAnswer(provider: LlmProvider, entryPoint: string): void {
  if (!(provider instanceof InSessionLlmProvider)) return;
  throw new Error(
    `${entryPoint} is the inline entry point; the in-session provider requires ` +
      'the two-step flow. Call collectSecurityCraftPrompts(...) and then ' +
      'finalizeSecurityCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
  );
}

export async function runSecurityCraft(input: SecurityCraftInput): Promise<SecurityCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSignalsPerFile = input.maxSignalsPerFile ?? DEFAULT_MAX_SIGNALS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();
  assertProviderCanAnswer(provider, 'runSecurityCraft');
  const rubrics = SEED_RUBRICS;

  const candidateFiles = collectFiles(projectRoot, input).slice(0, maxFiles);
  const findings: SecurityFinding[] = [];
  let filesScanned = 0;
  let filesSkippedNoSignal = 0;
  let signalsDetected = 0;

  for (const file of candidateFiles) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const signals = detectSignals(source, file);
    if (signals.length === 0) {
      filesSkippedNoSignal++;
      continue;
    }
    filesScanned++;
    const eligibleSignals = signals.slice(0, maxSignalsPerFile);
    signalsDetected += eligibleSignals.length;
    for (const signal of eligibleSignals) {
      for (const rubric of rubrics) {
        if (!rubricApplies(rubric, signal.kind)) continue;
        try {
          const finding = await critiqueOne({ file, source, signal, rubric, provider });
          if (finding !== null) findings.push(finding);
        } catch {
          /* swallow per-(signal, rubric) errors */
        }
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
      counts: { filesScanned, filesSkippedNoSignal, signalsDetected },
      runId: randomUUID(),
    },
  };
}

/**
 * Step 1 of the two-step in-session flow. Walks source files, detects signals,
 * builds one prompt per (signal, rubric) pair, persists run-state to disk, and
 * returns the prompts for the calling agent to answer. No LLM is called.
 */
export async function collectSecurityCraftPrompts(
  input: SecurityCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSignalsPerFile = input.maxSignalsPerFile ?? DEFAULT_MAX_SIGNALS_PER_FILE;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const runId = randomUUID();

  const candidateFiles = collectFiles(projectRoot, input).slice(0, maxFiles);
  const promptRecords: SecurityRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let filesScanned = 0;
  let filesSkippedNoSignal = 0;
  let signalsDetected = 0;

  outer: for (const file of candidateFiles) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const signals = detectSignals(source, file);
    if (signals.length === 0) {
      filesSkippedNoSignal++;
      continue;
    }
    filesScanned++;
    const eligibleSignals = signals.slice(0, maxSignalsPerFile);
    signalsDetected += eligibleSignals.length;
    for (const signal of eligibleSignals) {
      for (const rubric of SEED_RUBRICS) {
        if (!rubricApplies(rubric, signal.kind)) continue;
        rubricsApplied.add(rubric.id);
        const promptId = `p${promptRecords.length + 1}`;
        const userPrompt = buildPrompt({ file, source, signal, rubric });
        promptRecords.push({ promptId, file, signal, rubricId: rubric.id });
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
        'Re-invoke with smaller maxFiles / maxSignalsPerFile, or pass promptBudget to raise the ceiling.',
    };
  }

  const meta: SecurityRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    filesScanned,
    filesSkippedNoSignal,
    signalsDetected,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<SecurityRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'security-craft',
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
 * returns the final SecurityCraftOutput. Deletes run-state on success.
 */
export async function finalizeSecurityCraft(
  input: FinalizeSecurityCraftInput
): Promise<SecurityCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunStateOrThrow<SecurityRunMeta>(projectRoot, input.runId, 'security-craft');

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: SecurityFinding[] = [];

  for (const response of input.responses) {
    const promptRecord = promptById.get(response.promptId);
    if (promptRecord === undefined) continue;
    const rubric = rubricById.get(promptRecord.rubricId);
    if (rubric === undefined) continue;
    const finding = parseFindingFromRaw(response.raw, {
      file: promptRecord.file,
      signal: promptRecord.signal,
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
      catalog: { rubricsApplied: state.meta.rubricsApplied },
      counts: {
        filesScanned: state.meta.filesScanned,
        filesSkippedNoSignal: state.meta.filesSkippedNoSignal,
        signalsDetected: state.meta.signalsDetected,
      },
      runId: input.runId,
    },
  };
}

/**
 * Cross-cutting entry: critique a single source file without project walk.
 * Skips silently if the file has no security signals (consistent with the
 * orchestrator's FP-management strategy).
 */
export async function critiqueSecurityInFile(
  file: string,
  opts: {
    source?: string;
    rubrics?: ReadonlyArray<SecurityRubric>;
    provider?: LlmProvider;
    maxSignals?: number;
  } = {}
): Promise<SecurityFinding[]> {
  const source = opts.source ?? fs.readFileSync(file, 'utf-8');
  const signals = detectSignals(source, file).slice(
    0,
    opts.maxSignals ?? DEFAULT_MAX_SIGNALS_PER_FILE
  );
  if (signals.length === 0) return [];
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const findings: SecurityFinding[] = [];
  for (const signal of signals) {
    for (const rubric of rubrics) {
      if (!rubricApplies(rubric, signal.kind)) continue;
      try {
        const finding = await critiqueOne({ file, source, signal, rubric, provider });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow */
      }
    }
  }
  return findings;
}

function collectFiles(projectRoot: string, input: SecurityCraftInput): string[] {
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

export type {
  SecurityFinding,
  SecurityCraftOutput,
  SecuritySignal,
  SignalKind,
} from './findings/schema.js';
export type { SecurityRubric } from './catalog/rubrics/index.js';
