/**
 * api-craft orchestrator — the API-quality member of the craft-pipeline
 * initiative. An LLM-judgment ceiling skill for API design; the ceiling
 * counterpart to the rule-based API floor (harness-api-openapi-design and
 * harness-api-webhook-design, which are knowledge/rule skills about format and
 * OpenAPI compliance).
 *
 * Discovers a project's API surface — OpenAPI/Swagger specification documents
 * and route/handler definitions in code — and critiques each against a
 * kind-filtered rubric loop. A file under an API root with no route signal is
 * skipped (it is a helper, not an endpoint) — the FP/cost-management analogue of
 * cli-ergonomics-craft's barrel skip and code-craft's zero-unit skip.
 *
 * Structural twin of cli-ergonomics-craft.
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
  discoverApiSurfaces,
  classifyApiSurface,
  type DiscoveredApiSurface,
} from './extract/discover.js';
import { rubricsForKind, SEED_RUBRICS } from './catalog/rubrics/index.js';
import type { ApiSurfaceKind } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { ApiCraftOutput, ApiFinding } from './findings/schema.js';

export type ApiCraftMode = 'inline' | 'in-session';

export interface ApiCraftInput {
  path: string;
  files?: string[];
  routesDir?: string;
  specFile?: string;
  excludeDirs?: string[];
  maxFiles?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: ApiCraftMode;
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

export interface FinalizeApiCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface ApiRunMeta {
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
    kind: ApiSurfaceKind;
    rubricId: string;
  }>;
}

interface RunAccumulator {
  findings: ApiFinding[];
  rubricsApplied: Set<string>;
  filesScanned: number;
  filesSkipped: number;
}

export async function runApiCraft(input: ApiCraftInput): Promise<ApiCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const provider = input.__testProvider ?? getProvider();

  if (provider instanceof InSessionLlmProvider) {
    throw new Error(
      'runApiCraft is the inline entry point; the in-session provider ' +
        'requires the two-step flow. Call collectApiCraftPrompts(...) and ' +
        'then finalizeApiCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
    );
  }

  const surfaces = collectSurfaces(projectRoot, input).slice(0, maxFiles);
  const acc: RunAccumulator = {
    findings: [],
    rubricsApplied: new Set<string>(),
    filesScanned: 0,
    filesSkipped: 0,
  };

  for (const surface of surfaces) {
    await critiqueSurface(surface, provider, acc);
  }

  return {
    findings: acc.findings,
    summary: buildSummary(provider, acc, Date.now() - startedAt),
  };
}

/**
 * Step 1 of the two-step in-session flow. Discovers the project's API
 * surfaces, builds one prompt per (surface, rubric) pair, persists
 * run-state, and returns the prompts for the calling agent to answer.
 * No LLM is called.
 */
export async function collectApiCraftPrompts(
  input: ApiCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const runId = randomUUID();

  const surfaces = collectSurfaces(projectRoot, input).slice(0, maxFiles);
  const promptRecords: ApiRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let filesScanned = 0;
  let filesSkipped = 0;

  outer: for (const surface of surfaces) {
    let content: string;
    try {
      content = fs.readFileSync(surface.file, 'utf-8');
    } catch {
      filesSkipped++;
      continue;
    }
    filesScanned++;
    for (const rubric of rubricsForKind(surface.kind)) {
      rubricsApplied.add(rubric.id);
      const promptId = `p${promptRecords.length + 1}`;
      const userPrompt = buildPrompt({
        file: surface.file,
        relative: surface.relative,
        kind: surface.kind,
        content,
        rubric,
      });
      promptRecords.push({
        promptId,
        file: surface.file,
        relative: surface.relative,
        kind: surface.kind,
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

  const meta: ApiRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    filesScanned,
    filesSkipped,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<ApiRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'api-craft',
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
 * returns the final ApiCraftOutput. Deletes run-state on success.
 */
export async function finalizeApiCraft(input: FinalizeApiCraftInput): Promise<ApiCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunState<ApiRunMeta>(projectRoot, input.runId);
  if (state === null) {
    throw new Error(
      `api-craft: no persisted run found for runId=${input.runId} under ${projectRoot}. ` +
        'Run collectApiCraftPrompts first, or ensure the path matches the project root used at collection time.'
    );
  }
  if (state.skill !== 'api-craft') {
    throw new Error(
      `api-craft: runId=${input.runId} belongs to skill ${state.skill}, not api-craft.`
    );
  }

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: ApiFinding[] = [];

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

/** Critique a single discovered API surface across every rubric applicable to its kind. */
async function critiqueSurface(
  surface: DiscoveredApiSurface,
  provider: LlmProvider,
  acc: RunAccumulator
): Promise<void> {
  let content: string;
  try {
    content = fs.readFileSync(surface.file, 'utf-8');
  } catch {
    acc.filesSkipped++;
    return;
  }
  acc.filesScanned++;
  for (const rubric of rubricsForKind(surface.kind)) {
    acc.rubricsApplied.add(rubric.id);
    try {
      const finding = await critiqueOne({
        file: surface.file,
        relative: surface.relative,
        kind: surface.kind,
        content,
        rubric,
        provider,
      });
      if (finding !== null) acc.findings.push(finding);
    } catch {
      /* swallow per-(surface, rubric) errors */
    }
  }
}

function buildSummary(
  provider: LlmProvider,
  acc: RunAccumulator,
  durationMs: number
): ApiCraftOutput['summary'] {
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
 * Cross-cutting entry: critique a single API-surface file without a project
 * walk. Used by future craft skills (or an orchestrator) that already have a
 * spec or route file in hand.
 */
export async function critiqueApiSurfaceFile(
  file: string,
  opts: {
    source?: string;
    relative?: string;
    provider?: LlmProvider;
  } = {}
): Promise<ApiFinding[]> {
  const content = opts.source ?? fs.readFileSync(file, 'utf-8');
  const relative = opts.relative ?? path.basename(file);
  const kind = classifyApiSurface(relative, content);
  const provider = opts.provider ?? getProvider();
  const findings: ApiFinding[] = [];
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

function collectSurfaces(projectRoot: string, input: ApiCraftInput): DiscoveredApiSurface[] {
  if (input.files !== undefined && input.files.length > 0) {
    return input.files.map((f) => {
      const relative = path.relative(projectRoot, f).replaceAll('\\', '/');
      let content = '';
      try {
        content = fs.readFileSync(f, 'utf-8');
      } catch {
        /* classification falls back to route on unreadable file */
      }
      return { file: f, relative, kind: classifyApiSurface(relative, content) };
    });
  }
  const discoverOpts: {
    routesDir?: string;
    specFile?: string;
    extraExcludeDirs?: ReadonlyArray<string>;
  } = {};
  if (input.routesDir !== undefined) discoverOpts.routesDir = input.routesDir;
  if (input.specFile !== undefined) discoverOpts.specFile = input.specFile;
  if (input.excludeDirs !== undefined) discoverOpts.extraExcludeDirs = input.excludeDirs;
  return discoverApiSurfaces(projectRoot, discoverOpts);
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

export { API_ROOTS, OPENAPI_ROOTS } from './extract/discover.js';
export type { ApiFinding, ApiCraftOutput } from './findings/schema.js';
export type { DiscoveredApiSurface } from './extract/discover.js';
export type { ApiRubric, ApiSurfaceKind } from './catalog/rubrics/index.js';
export { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
export type { ApiExemplar } from './catalog/exemplars/index.js';
