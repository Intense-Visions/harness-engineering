/**
 * spec-craft orchestrator — second member of the craft-pipeline initiative
 * (#6 of 10). LLM-judgment skill that critiques spec quality (proposals + ADRs).
 *
 * Source: docs/changes/craft-pipeline/spec-craft/proposal.md
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
import { discoverSpecs, type DiscoveredSpec, type SpecKind } from './extract/discover.js';
import { parseSections } from './extract/sections.js';
import { SEED_RUBRICS, rubricApplies, type SpecRubric } from './catalog/rubrics/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { SpecCraftOutput, SpecFinding } from './findings/schema.js';

export type SpecCraftMode = 'inline' | 'in-session';

export interface SpecCraftInput {
  path: string;
  files?: string[];
  kinds?: SpecKind[];
  sections?: string[];
  maxFiles?: number;
  maxSectionsPerFile?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: SpecCraftMode;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 50;
const DEFAULT_MAX_SECTIONS_PER_FILE = 10;
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

export interface FinalizeSpecCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface SpecRunMeta {
  projectRoot: string;
  startedAt: number;
  rubricsApplied: string[];
  docsScanned: number;
  sectionsScanned: number;
  /** Pairs every queued prompt to the data needed to build a finding. */
  prompts: Array<{
    promptId: string;
    file: string;
    section: { heading: string; line: number };
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
      'the two-step flow. Call collectSpecCraftPrompts(...) and then ' +
      'finalizeSpecCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
  );
}

export async function runSpecCraft(input: SpecCraftInput): Promise<SpecCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSectionsPerFile = input.maxSectionsPerFile ?? DEFAULT_MAX_SECTIONS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();
  assertProviderCanAnswer(provider, 'runSpecCraft');
  const rubrics = SEED_RUBRICS;
  const sectionsFilter = input.sections;

  const specs = collectSpecs(projectRoot, input).slice(0, maxFiles);
  const findings: SpecFinding[] = [];
  let sectionsScanned = 0;

  for (const spec of specs) {
    let source: string;
    try {
      source = fs.readFileSync(spec.file, 'utf-8');
    } catch {
      continue;
    }
    const sections = parseSections(source);
    const eligible = sections
      .filter((s) => (sectionsFilter === undefined ? true : sectionsFilter.includes(s.canonical)))
      .slice(0, maxSectionsPerFile);
    sectionsScanned += eligible.length;
    for (const section of eligible) {
      for (const rubric of rubrics) {
        if (!rubricApplies(rubric, section.canonical)) continue;
        try {
          const finding = await critiqueOne({
            file: spec.file,
            section,
            rubric,
            provider,
          });
          if (finding !== null) findings.push(finding);
        } catch {
          /* swallow per-(section, rubric) errors */
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
      docsScanned: specs.length,
      sectionsScanned,
      runId: randomUUID(),
    },
  };
}

/**
 * Step 1 of the two-step in-session flow. Walks the specs, builds one prompt
 * per (section, rubric) pair, persists run-state to disk, and returns the
 * prompts for the calling agent to answer. No LLM is called.
 */
export async function collectSpecCraftPrompts(
  input: SpecCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSectionsPerFile = input.maxSectionsPerFile ?? DEFAULT_MAX_SECTIONS_PER_FILE;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const sectionsFilter = input.sections;
  const runId = randomUUID();

  const specs = collectSpecs(projectRoot, input).slice(0, maxFiles);
  const promptRecords: SpecRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let sectionsScanned = 0;

  outer: for (const spec of specs) {
    let source: string;
    try {
      source = fs.readFileSync(spec.file, 'utf-8');
    } catch {
      continue;
    }
    const sections = parseSections(source);
    const eligible = sections
      .filter((s) => (sectionsFilter === undefined ? true : sectionsFilter.includes(s.canonical)))
      .slice(0, maxSectionsPerFile);
    sectionsScanned += eligible.length;
    for (const section of eligible) {
      for (const rubric of SEED_RUBRICS) {
        if (!rubricApplies(rubric, section.canonical)) continue;
        rubricsApplied.add(rubric.id);
        const promptId = `p${promptRecords.length + 1}`;
        const userPrompt = buildPrompt({ file: spec.file, section, rubric });
        promptRecords.push({
          promptId,
          file: spec.file,
          section: { heading: section.heading, line: section.line },
          rubricId: rubric.id,
        });
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
        'Re-invoke with smaller maxFiles / maxSectionsPerFile, or pass promptBudget to raise the ceiling.',
    };
  }

  const meta: SpecRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    docsScanned: specs.length,
    sectionsScanned,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<SpecRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'spec-craft',
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
 * returns the final SpecCraftOutput. Deletes run-state on success.
 */
export async function finalizeSpecCraft(input: FinalizeSpecCraftInput): Promise<SpecCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunStateOrThrow<SpecRunMeta>(projectRoot, input.runId, 'spec-craft');

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: SpecFinding[] = [];

  for (const response of input.responses) {
    const promptRecord = promptById.get(response.promptId);
    if (promptRecord === undefined) continue;
    const rubric = rubricById.get(promptRecord.rubricId);
    if (rubric === undefined) continue;
    const finding = parseFindingFromRaw(response.raw, {
      file: promptRecord.file,
      section: promptRecord.section,
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
      docsScanned: state.meta.docsScanned,
      sectionsScanned: state.meta.sectionsScanned,
      runId: input.runId,
    },
  };
}

/**
 * Cross-cutting entry: critique a single spec file without project walk.
 * Used by future craft skills (or harness-brainstorming) that already
 * have a doc in hand.
 */
export async function critiqueSpecFile(
  file: string,
  opts: {
    source?: string;
    sections?: string[];
    rubrics?: ReadonlyArray<SpecRubric>;
    provider?: LlmProvider;
    maxSections?: number;
  } = {}
): Promise<SpecFinding[]> {
  const source = opts.source ?? fs.readFileSync(file, 'utf-8');
  const parsedSections = parseSections(source);
  const sectionsFilter = opts.sections;
  const eligible = parsedSections
    .filter((s) => (sectionsFilter === undefined ? true : sectionsFilter.includes(s.canonical)))
    .slice(0, opts.maxSections ?? DEFAULT_MAX_SECTIONS_PER_FILE);
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const findings: SpecFinding[] = [];
  for (const section of eligible) {
    for (const rubric of rubrics) {
      if (!rubricApplies(rubric, section.canonical)) continue;
      try {
        const finding = await critiqueOne({ file, section, rubric, provider });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow */
      }
    }
  }
  return findings;
}

function collectSpecs(projectRoot: string, input: SpecCraftInput): DiscoveredSpec[] {
  if (input.files !== undefined && input.files.length > 0) {
    return input.files.map((f) => ({
      file: f,
      kind: isUnderDecisionsDir(f) ? 'adr' : 'proposal',
    }));
  }
  return discoverSpecs(projectRoot, input.kinds);
}

/**
 * Detect whether the given file path lies under a `decisions` directory.
 * Used to classify caller-supplied --files entries as ADR vs proposal.
 * Splits by both path.sep and POSIX `/` so callers can pass either form
 * (CLI users on Windows can pass POSIX-style globs).
 */
function isUnderDecisionsDir(filePath: string): boolean {
  const segments = filePath.split(/[\\/]/);
  return segments.includes('decisions');
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

export type { SpecFinding, SpecCraftOutput } from './findings/schema.js';
export type { DiscoveredSpec, SpecKind } from './extract/discover.js';
