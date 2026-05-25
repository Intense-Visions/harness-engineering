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
import { getProvider, type LlmProvider } from './llm/provider.js';
import { extractIdentifiers, type ExtractedIdentifier } from './extract/identifiers.js';
import { sampleConventions } from './extract/convention.js';
import { SEED_RUBRICS, type NamingRubric } from './catalog/rubrics/index.js';
import { critiqueOne } from './phases/critique.js';
import type {
  NamingCraftOutput,
  NamingFinding,
  ProjectConvention,
  IdentifierKind,
} from './findings/schema.js';

export interface NamingCraftInput {
  path: string;
  files?: string[];
  kinds?: Array<IdentifierKind>;
  maxFiles?: number;
  maxIdentifiersPerFile?: number;
  /** Optional provider override for testing. */
  __testProvider?: LlmProvider;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_IDENTIFIERS_PER_FILE = 15;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

export async function runNamingCraft(input: NamingCraftInput): Promise<NamingCraftOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const maxFiles = input.maxFiles ?? DEFAULT_MAX_FILES;
  const maxIdentifiersPerFile = input.maxIdentifiersPerFile ?? DEFAULT_MAX_IDENTIFIERS_PER_FILE;
  const provider = input.__testProvider ?? getProvider();

  const files = collectFiles(projectRoot, input.files).slice(0, maxFiles);

  // First pass: extract all identifiers across files (for convention sampling).
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
