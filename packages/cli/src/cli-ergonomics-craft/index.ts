/**
 * cli-ergonomics-craft orchestrator — the CLI-quality member of the
 * craft-pipeline initiative. An LLM-judgment ceiling skill for command-line
 * ergonomics; the structural twin of docs-craft. Unlike docs-craft it has no
 * rule-based floor twin — a mechanical check can verify a flag is documented,
 * but only judgment can tell whether the name is predictable, whether the help
 * teaches, and whether the error says what to do next.
 *
 * Source: docs/changes/cli-ergonomics-craft/proposal.md
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
import { discoverCommands, classifyCommand, type DiscoveredCommand } from './extract/discover.js';
import { rubricsForKind, SEED_RUBRICS } from './catalog/rubrics/index.js';
import type { CommandKind } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import {
  critiqueOne,
  buildPrompt,
  parseFindingFromRaw,
  CRITIQUE_SYSTEM_PROMPT,
} from './phases/critique.js';
import type { CliErgonomicsCraftOutput, CliErgonomicsFinding } from './findings/schema.js';

export type CliErgonomicsCraftMode = 'inline' | 'in-session';

export interface CliErgonomicsCraftInput {
  path: string;
  files?: string[];
  commandsDir?: string;
  excludeDirs?: string[];
  maxFiles?: number;
  /** Two-step flow toggle. Defaults follow provider: in-session if env says so, else inline. */
  mode?: CliErgonomicsCraftMode;
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

export interface FinalizeCliErgonomicsCraftInput {
  path: string;
  runId: string;
  responses: Array<{ promptId: string; raw: string }>;
}

/** Skill-specific run-state metadata persisted between collect and finalize. */
interface CliRunMeta {
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
    kind: CommandKind;
    rubricId: string;
  }>;
}

interface RunAccumulator {
  findings: CliErgonomicsFinding[];
  rubricsApplied: Set<string>;
  filesScanned: number;
  filesSkipped: number;
}

export async function runCliErgonomicsCraft(
  input: CliErgonomicsCraftInput
): Promise<CliErgonomicsCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const provider = input.__testProvider ?? getProvider();

  if (provider instanceof InSessionLlmProvider) {
    throw new Error(
      'runCliErgonomicsCraft is the inline entry point; the in-session provider ' +
        'requires the two-step flow. Call collectCliErgonomicsCraftPrompts(...) and ' +
        'then finalizeCliErgonomicsCraft(...), or set HARNESS_CRAFT_LLM=mock for tests.'
    );
  }

  const commands = collectCommands(projectRoot, input).slice(0, maxFiles);
  const acc: RunAccumulator = {
    findings: [],
    rubricsApplied: new Set<string>(),
    filesScanned: 0,
    filesSkipped: 0,
  };

  for (const command of commands) {
    await critiqueCommand(command, provider, acc);
  }

  return {
    findings: acc.findings,
    summary: buildSummary(provider, acc, Date.now() - startedAt),
  };
}

/**
 * Step 1 of the two-step in-session flow. Walks the project's command
 * definitions, builds one prompt per (command, rubric) pair, persists
 * run-state, and returns the prompts for the calling agent to answer.
 * No LLM is called.
 */
export async function collectCliErgonomicsCraftPrompts(
  input: CliErgonomicsCraftInput & { promptBudget?: number }
): Promise<CollectPromptsOutput> {
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const budget = input.promptBudget ?? DEFAULT_PROMPT_BUDGET;
  const runId = randomUUID();

  const commands = collectCommands(projectRoot, input).slice(0, maxFiles);
  const promptRecords: CliRunMeta['prompts'] = [];
  const pending: CollectPromptsOutput['pendingPrompts'] = [];
  const rubricsApplied = new Set<string>();
  let filesScanned = 0;
  let filesSkipped = 0;

  outer: for (const command of commands) {
    let content: string;
    try {
      content = fs.readFileSync(command.file, 'utf-8');
    } catch {
      filesSkipped++;
      continue;
    }
    filesScanned++;
    for (const rubric of rubricsForKind(command.kind)) {
      rubricsApplied.add(rubric.id);
      const promptId = `p${promptRecords.length + 1}`;
      const userPrompt = buildPrompt({
        file: command.file,
        relative: command.relative,
        kind: command.kind,
        content,
        rubric,
      });
      promptRecords.push({
        promptId,
        file: command.file,
        relative: command.relative,
        kind: command.kind,
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

  const meta: CliRunMeta = {
    projectRoot,
    startedAt: Date.now(),
    rubricsApplied: [...rubricsApplied].sort(),
    filesScanned,
    filesSkipped,
    prompts: promptRecords,
  };
  pruneOldRuns(projectRoot);
  const { runFile } = saveRunState<CliRunMeta>(projectRoot, {
    v: 1,
    runId,
    skill: 'cli-ergonomics-craft',
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
 * returns the final CliErgonomicsCraftOutput. Deletes run-state on success.
 */
export async function finalizeCliErgonomicsCraft(
  input: FinalizeCliErgonomicsCraftInput
): Promise<CliErgonomicsCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const state = loadRunState<CliRunMeta>(projectRoot, input.runId);
  if (state === null) {
    throw new Error(
      `cli-ergonomics-craft: no persisted run found for runId=${input.runId} under ${projectRoot}. ` +
        'Run collectCliErgonomicsCraftPrompts first, or ensure the path matches the project root used at collection time.'
    );
  }
  if (state.skill !== 'cli-ergonomics-craft') {
    throw new Error(
      `cli-ergonomics-craft: runId=${input.runId} belongs to skill ${state.skill}, not cli-ergonomics-craft.`
    );
  }

  const rubricById = new Map(SEED_RUBRICS.map((r) => [r.id, r]));
  const promptById = new Map(state.meta.prompts.map((p) => [p.promptId, p]));
  const findings: CliErgonomicsFinding[] = [];

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

/** Critique a single discovered command across every rubric applicable to its kind. */
async function critiqueCommand(
  command: DiscoveredCommand,
  provider: LlmProvider,
  acc: RunAccumulator
): Promise<void> {
  let content: string;
  try {
    content = fs.readFileSync(command.file, 'utf-8');
  } catch {
    acc.filesSkipped++;
    return;
  }
  acc.filesScanned++;
  for (const rubric of rubricsForKind(command.kind)) {
    acc.rubricsApplied.add(rubric.id);
    try {
      const finding = await critiqueOne({
        file: command.file,
        relative: command.relative,
        kind: command.kind,
        content,
        rubric,
        provider,
      });
      if (finding !== null) acc.findings.push(finding);
    } catch {
      /* swallow per-(command, rubric) errors */
    }
  }
}

function buildSummary(
  provider: LlmProvider,
  acc: RunAccumulator,
  durationMs: number
): CliErgonomicsCraftOutput['summary'] {
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
 * Cross-cutting entry: critique a single command definition without a project
 * walk. Used by future craft skills (or an orchestrator) that already have a
 * command file in hand.
 */
export async function critiqueCommandFile(
  file: string,
  opts: {
    source?: string;
    relative?: string;
    provider?: LlmProvider;
  } = {}
): Promise<CliErgonomicsFinding[]> {
  const content = opts.source ?? fs.readFileSync(file, 'utf-8');
  const relative = opts.relative ?? path.basename(file);
  const kind = classifyCommand(relative, content);
  const provider = opts.provider ?? getProvider();
  const findings: CliErgonomicsFinding[] = [];
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

function collectCommands(projectRoot: string, input: CliErgonomicsCraftInput): DiscoveredCommand[] {
  if (input.files !== undefined && input.files.length > 0) {
    return input.files.map((f) => {
      const relative = path.relative(projectRoot, f).replaceAll('\\', '/');
      let content = '';
      try {
        content = fs.readFileSync(f, 'utf-8');
      } catch {
        /* classification falls back to leaf on unreadable file */
      }
      return { file: f, relative, kind: classifyCommand(relative, content) };
    });
  }
  const discoverOpts: { commandsDir?: string; extraExcludeDirs?: ReadonlyArray<string> } = {};
  if (input.commandsDir !== undefined) discoverOpts.commandsDir = input.commandsDir;
  if (input.excludeDirs !== undefined) discoverOpts.extraExcludeDirs = input.excludeDirs;
  return discoverCommands(projectRoot, discoverOpts);
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

export { COMMAND_ROOTS } from './extract/discover.js';
export type { CliErgonomicsFinding, CliErgonomicsCraftOutput } from './findings/schema.js';
export type { DiscoveredCommand } from './extract/discover.js';
export type { CliRubric, CommandKind } from './catalog/rubrics/index.js';
export { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
export type { CliExemplar } from './catalog/exemplars/index.js';
