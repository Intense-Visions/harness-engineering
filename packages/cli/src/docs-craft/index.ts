/**
 * docs-craft orchestrator — the documentation member of the craft-pipeline
 * initiative. LLM-judgment ceiling skill for documentation quality; the direct
 * structural twin of harness-design-craft and the ceiling counterpart to the
 * rule-based documentation floor (harness-detect-doc-drift / harness-check-docs
 * / harness-docs-pipeline).
 *
 * Source: docs/changes/docs-craft/proposal.md
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
  loadRunStateOrThrow,
  deleteRunState,
  pruneOldRuns,
} from '../shared/craft/runs/store.js';
import { discoverDocs, classifyDoc, type DiscoveredDoc } from './extract/discover.js';
import { rubricsForKind, SEED_RUBRICS, type DocKind } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { DocsCraftOutput, DocsFinding } from './findings/schema.js';

export type DocsCraftMode = 'inline' | 'in-session';

export interface DocsCraftInput {
  path: string;
  files?: string[];
  excludeDirs?: string[];
  maxFiles?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: DocsCraftMode;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 60;
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

export interface FinalizeDocsCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface DocsRunMeta {
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
    kind: DocKind;
    rubricId: string;
  }>;
}

interface RunAccumulator {
  findings: DocsFinding[];
  rubricsApplied: Set<string>;
  filesScanned: number;
  filesSkipped: number;
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
      'the two-step flow. Call collectDocsCraftPrompts(...) and then ' +
      'finalizeDocsCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
  );
}

export async function runDocsCraft(input: DocsCraftInput): Promise<DocsCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const provider = input.__testProvider ?? getProvider();
  assertProviderCanAnswer(provider, 'runDocsCraft');

  const docs = collectDocs(projectRoot, input).slice(0, maxFiles);
  const acc: RunAccumulator = {
    findings: [],
    rubricsApplied: new Set<string>(),
    filesScanned: 0,
    filesSkipped: 0,
  };

  for (const doc of docs) {
    await critiqueDoc(doc, provider, acc);
  }

  return {
    findings: acc.findings,
    summary: buildSummary(provider, acc, Date.now() - startedAt),
  };
}

/**
 * Step 1 of the two-step in-session flow. Discovers docs, builds one prompt
 * per (doc, rubric) pair, persists run-state to disk, and returns the prompts
 * for the calling agent to answer. No LLM is called.
 */
export async function collectDocsCraftPrompts(
  input: DocsCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const runId = randomUUID();

  const docs = collectDocs(projectRoot, input).slice(0, maxFiles);
  const promptRecords: DocsRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let filesScanned = 0;
  let filesSkipped = 0;

  outer: for (const doc of docs) {
    let content: string;
    try {
      content = fs.readFileSync(doc.file, 'utf-8');
    } catch {
      filesSkipped++;
      continue;
    }
    filesScanned++;
    for (const rubric of rubricsForKind(doc.kind)) {
      rubricsApplied.add(rubric.id);
      const promptId = `p${promptRecords.length + 1}`;
      const userPrompt = buildPrompt({
        file: doc.file,
        relative: doc.relative,
        kind: doc.kind,
        content,
        rubric,
      });
      promptRecords.push({
        promptId,
        file: doc.file,
        relative: doc.relative,
        kind: doc.kind,
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

  const meta: DocsRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    filesScanned,
    filesSkipped,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<DocsRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'docs-craft',
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
 * returns the final DocsCraftOutput. Deletes run-state on success.
 */
export async function finalizeDocsCraft(input: FinalizeDocsCraftInput): Promise<DocsCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunStateOrThrow<DocsRunMeta>(projectRoot, input.runId, 'docs-craft');

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: DocsFinding[] = [];

  for (const response of input.responses) {
    const promptRecord = promptById.get(response.promptId);
    if (promptRecord === undefined) continue;
    const rubric = rubricById.get(promptRecord.rubricId);
    if (rubric === undefined) continue;
    const finding = parseFindingFromRaw(response.raw, {
      file: promptRecord.file,
      relative: promptRecord.relative,
      kind: promptRecord.kind,
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
      counts: { filesScanned: state.meta.filesScanned, filesSkipped: state.meta.filesSkipped },
      runId: input.runId,
    },
  };
}

/** Critique a single discovered doc across every rubric applicable to its kind. */
async function critiqueDoc(
  doc: DiscoveredDoc,
  provider: LlmProvider,
  acc: RunAccumulator
): Promise<void> {
  let content: string;
  try {
    content = fs.readFileSync(doc.file, 'utf-8');
  } catch {
    acc.filesSkipped++;
    return;
  }
  acc.filesScanned++;
  for (const rubric of rubricsForKind(doc.kind)) {
    acc.rubricsApplied.add(rubric.id);
    try {
      const finding = await critiqueOne({
        file: doc.file,
        relative: doc.relative,
        kind: doc.kind,
        content,
        rubric,
        provider,
      });
      if (finding !== null) acc.findings.push(finding);
    } catch {
      /* swallow per-(doc, rubric) errors */
    }
  }
}

function buildSummary(
  provider: LlmProvider,
  acc: RunAccumulator,
  durationMs: number
): DocsCraftOutput['summary'] {
  const totalCost = sumCosts(provider);
  return {
    phaseRun: ['critique'],
    mode: 'fast',
    durationMs,
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
    counts: { filesScanned: acc.filesScanned, filesSkipped: acc.filesSkipped },
    runId: randomUUID(),
  };
}

/**
 * Cross-cutting entry: critique a single documentation file without a project
 * walk. Used by future craft skills (or harness-docs-pipeline) that already
 * have a doc in hand.
 */
export async function critiqueDocFile(
  file: string,
  opts: {
    source?: string;
    relative?: string;
    provider?: LlmProvider;
  } = {}
): Promise<DocsFinding[]> {
  const content = opts.source ?? fs.readFileSync(file, 'utf-8');
  const relative = opts.relative ?? path.basename(file);
  const kind = classifyDoc(relative);
  const provider = opts.provider ?? getProvider();
  const findings: DocsFinding[] = [];
  for (const rubric of rubricsForKind(kind)) {
    try {
      const finding = await critiqueOne({ file, relative, kind, content, rubric, provider });
      if (finding !== null) findings.push(finding);
    } catch {
      /* swallow */
    }
  }
  return findings;
}

function collectDocs(projectRoot: string, input: DocsCraftInput): DiscoveredDoc[] {
  if (input.files !== undefined && input.files.length > 0) {
    return input.files.map((f) => {
      const relative = path.relative(projectRoot, f).replaceAll('\\', '/');
      return { file: f, relative, kind: classifyDoc(relative) };
    });
  }
  return discoverDocs(projectRoot, input.excludeDirs);
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

export { DOCS_ROOT } from './extract/discover.js';
export type { DocsFinding, DocsCraftOutput } from './findings/schema.js';
export type { DiscoveredDoc } from './extract/discover.js';
export type { DocsRubric, DocKind } from './catalog/rubrics/index.js';
export { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
export type { DocsExemplar } from './catalog/exemplars/index.js';
