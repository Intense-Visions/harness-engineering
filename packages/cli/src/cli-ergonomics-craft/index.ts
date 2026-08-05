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
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import { discoverCommands, classifyCommand, type DiscoveredCommand } from './extract/discover.js';
import { rubricsForKind } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import { critiqueOne } from './phases/critique.js';
import type { CliErgonomicsCraftOutput, CliErgonomicsFinding } from './findings/schema.js';

export interface CliErgonomicsCraftInput {
  path: string;
  files?: string[];
  commandsDir?: string;
  excludeDirs?: string[];
  maxFiles?: number;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 60;

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
