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
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import {
  discoverKnowledgeEntries,
  KNOWLEDGE_ROOT,
  type DiscoveredEntry,
} from './extract/discover.js';
import { SEED_RUBRICS, type KnowledgeRubric } from './catalog/rubrics/index.js';
import { critiqueOne } from './phases/critique.js';
import type { KnowledgeCraftOutput, KnowledgeFinding } from './findings/schema.js';

export interface KnowledgeCraftInput {
  path: string;
  files?: string[];
  excludeDirs?: string[];
  maxFiles?: number;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 50;

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
