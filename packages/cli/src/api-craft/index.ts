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
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import {
  discoverApiSurfaces,
  classifyApiSurface,
  type DiscoveredApiSurface,
} from './extract/discover.js';
import { rubricsForKind } from './catalog/rubrics/index.js';
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js';
import { critiqueOne } from './phases/critique.js';
import type { ApiCraftOutput, ApiFinding } from './findings/schema.js';

export interface ApiCraftInput {
  path: string;
  files?: string[];
  routesDir?: string;
  specFile?: string;
  excludeDirs?: string[];
  maxFiles?: number;
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 60;

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
