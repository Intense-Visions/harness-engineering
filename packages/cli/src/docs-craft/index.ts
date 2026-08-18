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
import { discoverDocs, classifyDoc, type DiscoveredDoc } from './extract/discover.js';
import { rubricsForKind } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import { critiqueOne } from './phases/critique.js';
import type { DocsCraftOutput, DocsFinding } from './findings/schema.js';

export interface DocsCraftInput {
  path: string;
  files?: string[];
  excludeDirs?: string[];
  maxFiles?: number;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 60;

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
    `${entryPoint} cannot run against the in-session provider: it defers every ` +
      'prompt to the calling agent, so no rubric would actually be evaluated ' +
      'and the run would report zero findings for zero critiques. Configure a ' +
      'real backend via agent.backends + HARNESS_CRAFT_LLM, or set ' +
      'HARNESS_CRAFT_LLM=mock for tests.'
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
