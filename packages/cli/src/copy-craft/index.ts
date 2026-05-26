/**
 * copy-craft orchestrator — third member of the craft-pipeline initiative
 * (#5 of 10). LLM-judgment skill that critiques prose-in-code across six
 * surfaces: errors, logs, CLI output, commits, PR descriptions, comments.
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import { getProvider, type LlmProvider } from '../shared/craft/llm/provider.js';
import { extractFromSource } from './extract/source.js';
import { extractCommits } from './extract/commits.js';
import { extractPRDescriptions } from './extract/pr-descriptions.js';
import { SEED_RUBRICS, rubricApplies, type CopyRubric } from './catalog/rubrics/index.js';
import { critiqueOne } from './phases/critique.js';
import type {
  CopyCraftOutput,
  CopyFinding,
  CopySurface,
  ExtractedCopyItem,
} from './findings/schema.js';

export interface CopyCraftInput {
  path: string;
  files?: string[];
  surfaces?: CopySurface[];
  maxFiles?: number;
  maxItemsPerFile?: number;
  commitsSince?: string;
  prLimit?: number;
  cliOutputPaths?: string[];
  /** Test-only LLM provider override. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_ITEMS_PER_FILE = 20;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const ALL_SURFACES: CopySurface[] = [
  'error',
  'log',
  'cli-output',
  'commit',
  'pr-description',
  'comment',
];

export async function runCopyCraft(input: CopyCraftInput): Promise<CopyCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxItemsPerFile = input.maxItemsPerFile ?? DEFAULT_MAX_ITEMS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();
  const rubrics = SEED_RUBRICS;
  const enabledSurfaces = new Set<CopySurface>(input.surfaces ?? ALL_SURFACES);

  const items: ExtractedCopyItem[] = [];
  const counts: Record<CopySurface, number> = {
    error: 0,
    log: 0,
    'cli-output': 0,
    commit: 0,
    'pr-description': 0,
    comment: 0,
  };
  const skippedSurfaces: Array<{ surface: CopySurface; reason: string }> = [];

  // Source-side surfaces (error / log / cli-output / comment)
  const sourceSurfaces: CopySurface[] = (['error', 'log', 'cli-output', 'comment'] as const).filter(
    (s) => enabledSurfaces.has(s)
  );
  if (sourceSurfaces.length > 0) {
    const files = collectSourceFiles(projectRoot, input.files).slice(0, maxFiles);
    for (const file of files) {
      let source: string;
      try {
        source = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const extracted = extractFromSource({
        file,
        source,
        surfaces: sourceSurfaces,
        ...(input.cliOutputPaths !== undefined && { cliOutputPaths: input.cliOutputPaths }),
      });
      // Cap per-file at maxItemsPerFile across all surfaces
      const capped = extracted.slice(0, maxItemsPerFile);
      for (const item of capped) {
        counts[item.surface]++;
        items.push(item);
      }
    }
  }

  // Commit subjects (shell-out)
  if (enabledSurfaces.has('commit')) {
    const result = extractCommits({
      projectRoot,
      ...(input.commitsSince !== undefined && { since: input.commitsSince }),
    });
    if (result.skipReason !== undefined) {
      skippedSurfaces.push({ surface: 'commit', reason: result.skipReason });
    } else {
      for (const item of result.items) {
        counts.commit++;
        items.push(item);
      }
    }
  }

  // PR descriptions (shell-out)
  if (enabledSurfaces.has('pr-description')) {
    const result = extractPRDescriptions({
      projectRoot,
      ...(input.prLimit !== undefined && { limit: input.prLimit }),
    });
    if (result.skipReason !== undefined) {
      skippedSurfaces.push({ surface: 'pr-description', reason: result.skipReason });
    } else {
      for (const item of result.items) {
        counts['pr-description']++;
        items.push(item);
      }
    }
  }

  // Critique loop
  const findings: CopyFinding[] = [];
  for (const item of items) {
    for (const rubric of rubrics) {
      if (!rubricApplies(rubric, item.surface)) continue;
      try {
        const finding = await critiqueOne({ item, rubric, provider });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow per-(item, rubric) errors */
      }
    }
  }

  const surfacesScanned = ALL_SURFACES.filter(
    (s) => enabledSurfaces.has(s) && !skippedSurfaces.some((sk) => sk.surface === s)
  );
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
      catalog: {
        rubricsApplied: rubrics.map((r) => r.id),
        surfacesScanned,
      },
      counts,
      skippedSurfaces,
      runId: randomUUID(),
    },
  };
}

/**
 * Cross-cutting entry: critique copy in a single source file without
 * the project walk. Source-side surfaces only (git surfaces are
 * project-scoped).
 */
export async function critiqueCopyInFile(
  file: string,
  opts: {
    source?: string;
    surfaces?: CopySurface[];
    rubrics?: ReadonlyArray<CopyRubric>;
    provider?: LlmProvider;
    cliOutputPaths?: string[];
  } = {}
): Promise<CopyFinding[]> {
  const source = opts.source ?? fs.readFileSync(file, 'utf-8');
  const rubrics = opts.rubrics ?? SEED_RUBRICS;
  const provider = opts.provider ?? getProvider();
  const surfaces = opts.surfaces ?? (['error', 'log', 'cli-output', 'comment'] as CopySurface[]);
  const items = extractFromSource({
    file,
    source,
    surfaces,
    ...(opts.cliOutputPaths !== undefined && { cliOutputPaths: opts.cliOutputPaths }),
  });
  const findings: CopyFinding[] = [];
  for (const item of items) {
    for (const rubric of rubrics) {
      if (!rubricApplies(rubric, item.surface)) continue;
      try {
        const finding = await critiqueOne({ item, rubric, provider });
        if (finding !== null) findings.push(finding);
      } catch {
        /* swallow */
      }
    }
  }
  return findings;
}

function collectSourceFiles(
  projectRoot: string,
  explicitFiles: readonly string[] | undefined
): string[] {
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
    else if (entry.isFile() && SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
      out.push(full);
  }
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

export type { CopyFinding, CopyCraftOutput, CopySurface } from './findings/schema.js';
