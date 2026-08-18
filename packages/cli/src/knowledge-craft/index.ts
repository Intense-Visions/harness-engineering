/**
 * knowledge-craft orchestrator — fifth non-design member of the
 * craft-pipeline initiative (#9 of 10). LLM-judgment skill that critiques
 * knowledge-entry quality (`docs/knowledge/` excluding `decisions/`).
 *
 * Source: docs/changes/craft-pipeline/knowledge-craft/proposal.md
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
import {
  saveRunState,
  loadRunState,
  deleteRunState,
  pruneOldRuns,
} from '../shared/craft/runs/store.js';
import {
  discoverKnowledgeEntries,
  KNOWLEDGE_ROOT,
  type DiscoveredEntry,
} from './extract/discover.js';
import { SEED_RUBRICS, type KnowledgeRubric } from './catalog/rubrics/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { KnowledgeCraftOutput, KnowledgeFinding } from './findings/schema.js';

export type KnowledgeCraftMode = 'inline' | 'in-session';

export interface KnowledgeCraftInput {
  path: string;
  files?: string[];
  excludeDirs?: string[];
  maxFiles?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: KnowledgeCraftMode;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 50;
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

export interface FinalizeKnowledgeCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface KnowledgeRunMeta {
  projectRoot: string;
  startedAt: number;
  rubricsApplied: string[];
  filesScanned: number;
  filesSkipped: number;
  /** Pairs every queued prompt to the data needed to build a finding. */
  prompts: Array<{
    promptId: string;
    file: string;
    relative: string;
    rubricId: string;
  }>;
}

/** Same defensive cap validation runKnowledgeCraft uses (see below). */
function resolveMaxFiles(maxFiles: number | undefined): number {
  return maxFiles !== undefined && Number.isFinite(maxFiles) && maxFiles >= 0
    ? maxFiles
    : DEFAULT_MAX_FILES;
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
      'the two-step flow. Call collectKnowledgeCraftPrompts(...) and then ' +
      'finalizeKnowledgeCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
  );
}

export async function runKnowledgeCraft(input: KnowledgeCraftInput): Promise<KnowledgeCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  // A cap must be a non-negative finite number. A negative value would hit
  // JS negative-index `slice` semantics and silently drop trailing entries
  // (e.g. maxFiles=-1 => scans all but the last file); NaN/Infinity are
  // equally nonsensical. Fall back to the default for any invalid cap.
  const maxFiles =
    input.maxFiles !== undefined && Number.isFinite(input.maxFiles) && input.maxFiles >= 0
      ? input.maxFiles
      : DEFAULT_MAX_FILES;
  const provider = input.__testProvider ?? getProvider();
  assertProviderCanAnswer(provider, 'runKnowledgeCraft');
  const rubrics = SEED_RUBRICS;

  const entries = collectEntries(projectRoot, input).slice(0, maxFiles);
  const findings: KnowledgeFinding[] = [];
  let filesScanned = 0;
  let filesSkipped = 0;

  for (const entry of entries) {
    let content: string;
    try {
      content = fs.readFileSync(entry.file, 'utf-8');
    } catch {
      filesSkipped++;
      continue;
    }
    filesScanned++;
    for (const rubric of rubrics) {
      try {
        const finding = await critiqueOne({
          file: entry.file,
          relative: entry.relative,
          content,
          rubric,
          provider,
        });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow per-(file, rubric) errors */
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
      counts: { filesScanned, filesSkipped },
      runId: randomUUID(),
    },
  };
}

/**
 * Step 1 of the two-step in-session flow. Discovers knowledge entries, builds
 * one prompt per (entry, rubric) pair, persists run-state to disk, and returns
 * the prompts for the calling agent to answer. No LLM is called.
 */
export async function collectKnowledgeCraftPrompts(
  input: KnowledgeCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = resolveMaxFiles(input.maxFiles);
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const runId = randomUUID();

  const entries = collectEntries(projectRoot, input).slice(0, maxFiles);
  const promptRecords: KnowledgeRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let filesScanned = 0;
  let filesSkipped = 0;

  outer: for (const entry of entries) {
    let content: string;
    try {
      content = fs.readFileSync(entry.file, 'utf-8');
    } catch {
      filesSkipped++;
      continue;
    }
    filesScanned++;
    for (const rubric of SEED_RUBRICS) {
      rubricsApplied.add(rubric.id);
      const promptId = `p${promptRecords.length + 1}`;
      const userPrompt = buildPrompt({
        file: entry.file,
        relative: entry.relative,
        content,
        rubric,
      });
      promptRecords.push({
        promptId,
        file: entry.file,
        relative: entry.relative,
        rubricId: rubric.id,
      });
      pending.push({ promptId, systemPrompt: CRITIQUE_SYSTEM_PROMPT, userPrompt });
      if (pending.length > budget) break outer;
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
        'Re-invoke with smaller maxFiles, or pass promptBudget to raise the ceiling.',
    };
  }

  const meta: KnowledgeRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    filesScanned,
    filesSkipped,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<KnowledgeRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'knowledge-craft',
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
 * returns the final KnowledgeCraftOutput. Deletes run-state on success.
 */
export async function finalizeKnowledgeCraft(
  input: FinalizeKnowledgeCraftInput
): Promise<KnowledgeCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunState<KnowledgeRunMeta>(projectRoot, input.runId);
  if (state === null) {
    throw new Error(
      `knowledge-craft: no persisted run found for runId=${input.runId} under ${projectRoot}. ` +
        'Run collectKnowledgeCraftPrompts first, or ensure the path matches the project root used at collection time.'
    );
  }
  if (state.skill !== 'knowledge-craft') {
    throw new Error(
      `knowledge-craft: runId=${input.runId} belongs to skill ${state.skill}, not knowledge-craft.`
    );
  }

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: KnowledgeFinding[] = [];

  for (const response of input.responses) {
    const promptRecord = promptById.get(response.promptId);
    if (promptRecord === undefined) continue;
    const rubric = rubricById.get(promptRecord.rubricId);
    if (rubric === undefined) continue;
    const finding = parseFindingFromRaw(response.raw, {
      file: promptRecord.file,
      relative: promptRecord.relative,
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
      counts: { filesScanned: state.meta.filesScanned, filesSkipped: state.meta.filesSkipped },
      runId: input.runId,
    },
  };
}

/**
 * Cross-cutting entry: critique a single knowledge file without project
 * walk. Used by future craft skills (or harness-knowledge-pipeline) that
 * already have an entry in hand.
 */
export async function critiqueKnowledgeFile(
  file: string,
  opts: {
    source?: string;
    relative?: string;
    rubrics?: ReadonlyArray<KnowledgeRubric>;
    provider?: LlmProvider;
  } = {}
): Promise<KnowledgeFinding[]> {
  const content = opts.source ?? fs.readFileSync(file, 'utf-8');
  const relative = opts.relative ?? path.basename(file);
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const findings: KnowledgeFinding[] = [];
  for (const rubric of rubrics) {
    try {
      const finding = await critiqueOne({ file, relative, content, rubric, provider });
      if (finding !== null) findings.push(finding);
    } catch {
      /* swallow */
    }
  }
  return findings;
}

function collectEntries(projectRoot: string, input: KnowledgeCraftInput): DiscoveredEntry[] {
  if (input.files !== undefined && input.files.length > 0) {
    const root = path.join(projectRoot, KNOWLEDGE_ROOT);
    return input.files.map((f) => ({
      file: f,
      relative: path.relative(root, f).replaceAll('\\', '/'),
    }));
  }
  return discoverKnowledgeEntries(projectRoot, input.excludeDirs);
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

export type { KnowledgeFinding, KnowledgeCraftOutput } from './findings/schema.js';
export type { DiscoveredEntry } from './extract/discover.js';
export type { KnowledgeRubric } from './catalog/rubrics/index.js';
