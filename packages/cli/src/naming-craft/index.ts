/**
 * naming-craft orchestrator — first member of the craft-pipeline
 * initiative (#1 of 10). LLM-judgment skill that critiques identifier
 * names against a curated rubric catalog.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import { getProvider, type LlmProvider, InSessionLlmProvider } from './llm/provider.js';
import { extractIdentifiers, type ExtractedIdentifier } from './extract/identifiers.js';
import { sampleConventions } from './extract/convention.js';
import { SEED_RUBRICS, type NamingRubric } from './catalog/rubrics/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import {
  saveRunState,
  loadRunState,
  deleteRunState,
  pruneOldRuns,
} from '../shared/craft/runs/store.js';
import type {
  NamingCraftOutput,
  NamingFinding,
  ProjectConvention,
  IdentifierKind,
} from './findings/schema.js';

export type NamingCraftMode = 'inline' | 'in-session';

export interface NamingCraftInput {
  path: string;
  files?: string[];
  kinds?: Array<IdentifierKind>;
  maxFiles?: number;
  maxIdentifiersPerFile?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: NamingCraftMode;
  /** Optional provider override for testing. */
  __testProvider?: LlmProvider;
}

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

export interface FinalizeNamingCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_IDENTIFIERS_PER_FILE = 15;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface NamingRunMeta {
  projectRoot: string;
  startedAt: number;
  convention: ProjectConvention;
  rubricsApplied: string[];
  /** Pairs every queued prompt to the data needed to build a finding. */
  prompts: Array<{
    promptId: string;
    identifier: ExtractedIdentifier;
    rubricId: string;
  }>;
}

interface ProjectContext {
  projectRoot: string;
  files: string[];
  perFile: Map<string, ExtractedIdentifier[]>;
  convention: ProjectConvention;
}

function gatherProjectContext(input: NamingCraftInput): ProjectContext {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const files = collectFiles(projectRoot, input.files).slice(0, maxFiles);
  const allIdentifiers: ExtractedIdentifier[] = [];
  const perFile: Map<string, ExtractedIdentifier[]> = new Map();
  for (const file of files) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const ids = extractIdentifiers(file, source);
    perFile.set(file, ids);
    allIdentifiers.push(...ids);
  }
  const convention = sampleConventions(allIdentifiers, files);
  return { projectRoot, files, perFile, convention };
}

export async function runNamingCraft(input: NamingCraftInput): Promise<NamingCraftOutput> {
  const startedAt = Date.now();
  const maxIdentifiersPerFile = input.maxIdentifiersPerFile ?? DEFAULT_MAX_IDENTIFIERS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();

  if (provider instanceof InSessionLlmProvider) {
    throw new Error(
      'runNamingCraft is the inline entry point; the in-session provider ' +
        'requires the two-step flow. Call collectNamingCraftPrompts(...) and ' +
        'then finalizeNamingCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
    );
  }

  const { perFile, convention } = gatherProjectContext(input);
  const rubrics = SEED_RUBRICS;
  const findings: NamingFinding[] = [];

  for (const [, identifiers] of perFile) {
    const sample = sampleIdentifiers(identifiers, maxIdentifiersPerFile, input.kinds);
    for (const identifier of sample) {
      for (const rubric of rubrics) {
        if (!rubric.appliesTo.includes(identifier.kind)) continue;
        try {
          const finding = await critiqueOne({ identifier, rubric, convention, provider });
          if (finding !== null) findings.push(finding);
        } catch {
          // Swallow per-(identifier, rubric) errors — one bad LLM call
          // shouldn't sink the whole run.
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
      convention,
      runId: randomUUID(),
    },
  };
}

/**
 * Step 1 of the two-step in-session flow. Walks the project, builds one
 * prompt per (identifier, rubric) pair, persists run-state to disk, and
 * returns the prompts for the calling agent to answer. No LLM is called.
 */
export async function collectNamingCraftPrompts(
  input: NamingCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const maxIdentifiersPerFile = input.maxIdentifiersPerFile ?? DEFAULT_MAX_IDENTIFIERS_PER_FILE;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const { projectRoot, perFile, convention } = gatherProjectContext(input);
  const rubrics = SEED_RUBRICS;
  const runId = randomUUID();

  const promptRecords: NamingRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];

  outer: for (const [, identifiers] of perFile) {
    const sample = sampleIdentifiers(identifiers, maxIdentifiersPerFile, input.kinds);
    for (const identifier of sample) {
      for (const rubric of rubrics) {
        if (!rubric.appliesTo.includes(identifier.kind)) continue;
        // Use the InSession provider only to gain a stable promptId per pair.
        const promptId = `p${promptRecords.length + 1}`;
        const userPrompt = buildPrompt({ identifier, rubric, convention });
        promptRecords.push({ promptId, identifier, rubricId: rubric.id });
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
        'Re-invoke with smaller maxFiles / maxIdentifiersPerFile, or pass promptBudget to raise the ceiling.',
    };
  }

  const meta: NamingRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    convention,
    rubricsApplied: rubrics.map((r) => r.id),
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<NamingRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'naming-craft',
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
 * returns the final NamingCraftOutput. Deletes the run-state file on
 * successful completion.
 */
export async function finalizeNamingCraft(
  input: FinalizeNamingCraftInput
): Promise<NamingCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunState<NamingRunMeta>(projectRoot, input.runId);
  if (state === null) {
    throw new Error(
      `naming-craft: no persisted run found for runId=${input.runId} under ${projectRoot}. ` +
        'Run collectNamingCraftPrompts first, or ensure the path matches the project root used at collection time.'
    );
  }
  if (state.skill !== 'naming-craft') {
    throw new Error(
      `naming-craft: runId=${input.runId} belongs to skill ${state.skill}, not naming-craft.`
    );
  }

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: NamingFinding[] = [];

  for (const response of input.responses) {
    const promptRecord = promptById.get(response.promptId);
    if (promptRecord === undefined) continue;
    const rubric = rubricById.get(promptRecord.rubricId);
    if (rubric === undefined) continue;
    const finding = parseFindingFromRaw(response.raw, {
      identifier: promptRecord.identifier,
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
      convention: state.meta.convention,
      runId: input.runId,
    },
  };
}

/**
 * Cross-cutting entry: critique names in a single file without the
 * project walk. Used by future craft skills (docs-craft, test-craft,
 * code-craft) that already have file context.
 */
export async function critiqueNamesInFile(
  file: string,
  opts: {
    source?: string;
    kinds?: Array<IdentifierKind>;
    convention?: ProjectConvention;
    provider?: LlmProvider;
    rubrics?: ReadonlyArray<NamingRubric>;
    maxIdentifiers?: number;
  } = {}
): Promise<NamingFinding[]> {
  const source = opts.source ?? fs.readFileSync(file, 'utf-8');
  const identifiers = extractIdentifiers(file, source);
  const convention = opts.convention ?? sampleConventions(identifiers, [file]);
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const sample = sampleIdentifiers(
    identifiers,
    opts.maxIdentifiers ?? DEFAULT_MAX_IDENTIFIERS_PER_FILE,
    opts.kinds
  );
  const findings: NamingFinding[] = [];
  for (const identifier of sample) {
    for (const rubric of rubrics) {
      if (!rubric.appliesTo.includes(identifier.kind)) continue;
      try {
        const finding = await critiqueOne({ identifier, rubric, convention, provider });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow per-call */
      }
    }
  }
  return findings;
}

function collectFiles(projectRoot: string, explicitFiles: readonly string[] | undefined): string[] {
  if (explicitFiles !== undefined && explicitFiles.length > 0) {
    return explicitFiles.map((f) => (path.isAbsolute(f) ? f : path.join(projectRoot, f)));
  }
  const out: string[] = [];
  walk(projectRoot, out, 0);
  return out;
}

function walk(dir: string, out: string[], depth: number): void {
  if (depth > 8) return;
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
    else if (entry.isFile() && EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
}

/**
 * Weighted sample: exported first, then long-scope, then random fill.
 */
function sampleIdentifiers(
  identifiers: readonly ExtractedIdentifier[],
  max: number,
  kindsFilter: ReadonlyArray<IdentifierKind> | undefined
): ExtractedIdentifier[] {
  const candidates = identifiers.filter((i) => {
    if (kindsFilter !== undefined && !kindsFilter.includes(i.kind)) return false;
    return true;
  });
  const exported = candidates.filter((i) => i.exported);
  const longScope = candidates.filter((i) => !i.exported && i.scopeSize === 'long');
  const shortScope = candidates.filter((i) => !i.exported && i.scopeSize === 'short');
  const out: ExtractedIdentifier[] = [];
  const dedup = new Set<string>();
  for (const list of [exported, longScope, shortScope]) {
    for (const id of list) {
      const key = `${id.kind}:${id.name}:${id.line}`;
      if (dedup.has(key)) continue;
      dedup.add(key);
      out.push(id);
      if (out.length >= max) return out;
    }
  }
  return out;
}

interface CostSummary {
  count: number;
  costUsd: number;
}

function sumCosts(provider: LlmProvider): CostSummary {
  // MockLlmProvider exposes getCosts(); production providers may not.
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
  NamingFinding,
  NamingCraftOutput,
  IdentifierKind,
  ProjectConvention,
} from './findings/schema.js';
