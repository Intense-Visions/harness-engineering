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
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import { discoverSourceFiles } from './extract/discover.js';
import { detectSignals } from './extract/signals.js';
import { SEED_RUBRICS, rubricApplies, type SecurityRubric } from './catalog/rubrics/index.js';
import { critiqueOne } from './phases/critique.js';
import type { SecurityCraftOutput, SecurityFinding } from './findings/schema.js';

export interface SecurityCraftInput {
  path: string;
  files?: string[];
  packages?: string[];
  maxFiles?: number;
  maxSignalsPerFile?: number;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_SIGNALS_PER_FILE = 10;

export async function runSecurityCraft(input: SecurityCraftInput): Promise<SecurityCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxSignalsPerFile = input.maxSignalsPerFile ?? DEFAULT_MAX_SIGNALS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();
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
