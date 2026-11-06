/**
 * Entry point for the detect-design-drift skill — Verifier-shape return
 * mirrors audit-anatomy (runAudit) and design-craft (runDesignCraft).
 *
 * v1 scope (per spec Q3):
 *   - Token bypass detection (DRIFT-T*) when tokens.json exists
 *   - Primitive adoption detection (DRIFT-P*) when DESIGN.md
 *     `## Component Registry` exists
 *
 * Composes by harness check-design as the 3rd verifier.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Technical Design → File layout).
 */

import * as fs from 'node:fs';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import {
  collectDesignScanFiles,
  designScanAbstention,
  noFilesScannedError,
  resolveDesignExcludePatterns,
} from '../shared/design-scan-targets.js';
import type { DriftFinding, DriftSeverity, DriftStrictness } from './findings/finding.js';
import { loadTokenSet } from './resolvers/tokens.js';
import { loadComponentRegistry } from './resolvers/component-registry.js';
import { runTokenBypassRule } from './rules/token-bypass-rule.js';
import { runPrimitiveAdoptionRule } from './rules/primitive-adoption-rule.js';

export type DetectDriftMode = 'fast' | 'full';

export interface DetectDriftInput {
  path: string;
  mode?: DetectDriftMode;
  files?: string[];
  designStrictness?: DriftStrictness;
  rules?: {
    tokenBypass?: boolean;
    primitiveAdoption?: boolean;
  };
  /**
   * Optional override for the design-specific exclude globs (minimatch). When
   * omitted, the runner loads `design.exclude` from harness.config.json; when
   * provided (e.g. from the detect_drift MCP tool), it replaces that config
   * read. Either way it is unioned with the project-wide `analysis.exclude`
   * and ignored when an explicit `files` list is provided.
   */
  exclude?: string[];
}

import type { Verifier } from '../shared/verifier.js';

// Conforms to the shared Verifier<F, Cat, Meta> shape extracted at the
// 4th-verifier threshold (audit-brand-compliance).
export type DetectDriftOutput = Verifier<
  DriftFinding,
  { rulesApplied: string[] },
  {
    mode: DetectDriftMode;
    tokensLoaded: boolean;
    registryLoaded: boolean;
    /**
     * Exclude globs the file walk actually applied. Empty when an explicit
     * `files` scope was given, because that path bypasses the walk and its
     * filter entirely — reporting the configured globs there would claim a
     * filter that never ran.
     */
    excludePatterns: string[];
  }
>;

/**
 * Resolved configuration for a single detect-design-drift run. Centralizes
 * input defaulting and the loaded token/registry resources so the entry
 * point stays declarative.
 */
interface ResolvedDriftConfig {
  projectRoot: string;
  mode: DetectDriftMode;
  strictness: DriftStrictness;
  tokenBypassEnabled: boolean;
  primitiveAdoptionEnabled: boolean;
  tokens: ReturnType<typeof loadTokenSet>;
  registry: ReturnType<typeof loadComponentRegistry>;
  /** design.exclude ∪ analysis.exclude — minimatch globs applied to the walk. */
  excludePatterns: string[];
}

/**
 * Resolve input defaults and load the token/registry resources.
 */
function resolveDriftConfig(input: DetectDriftInput): ResolvedDriftConfig {
  const projectRoot = sanitizePath(input.path);
  const tokenBypassEnabled = input.rules?.tokenBypass !== false;
  const primitiveAdoptionEnabled = input.rules?.primitiveAdoption !== false;
  // design.exclude stacked on top of the project-wide analysis.exclude —
  // mirrors security.ts's exclude union. Both are loaded from config INSIDE the
  // runner so every caller (validate, check-design, align, design-pipeline, MCP)
  // honors them uniformly. An explicit `input.exclude` overrides the config read
  // (used by the detect_drift MCP tool); pass [] to force "no design excludes".
  const excludePatterns = resolveDesignExcludePatterns(projectRoot, input.exclude);
  return {
    projectRoot,
    mode: input.mode ?? 'fast',
    strictness: input.designStrictness ?? 'standard',
    tokenBypassEnabled,
    primitiveAdoptionEnabled,
    tokens: tokenBypassEnabled ? loadTokenSet(projectRoot) : null,
    registry: primitiveAdoptionEnabled ? loadComponentRegistry(projectRoot) : null,
    excludePatterns,
  };
}

/**
 * Derive the list of rules that actually ran (enabled AND resource loaded).
 */
function computeRulesApplied(config: ResolvedDriftConfig): string[] {
  const rulesApplied: string[] = [];
  if (config.tokenBypassEnabled && config.tokens !== null) rulesApplied.push('token-bypass');
  if (config.primitiveAdoptionEnabled && config.registry !== null) {
    rulesApplied.push('primitive-adoption');
  }
  return rulesApplied;
}

/**
 * Run the enabled rules against a single file's source. Returns an empty
 * list when the file cannot be read.
 */
function scanFile(file: string, config: ResolvedDriftConfig): DriftFinding[] | 'unreadable' {
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf-8');
  } catch {
    return 'unreadable';
  }
  const findings: DriftFinding[] = [];
  if (config.tokenBypassEnabled && config.tokens !== null) {
    findings.push(
      ...runTokenBypassRule({ source, file, tokens: config.tokens, strictness: config.strictness })
    );
  }
  if (config.primitiveAdoptionEnabled && config.registry !== null) {
    findings.push(
      ...runPrimitiveAdoptionRule({
        source,
        file,
        registry: config.registry,
        strictness: config.strictness,
      })
    );
  }
  return findings;
}

/**
 * Scan every candidate file and accumulate findings.
 */
/**
 * Scan every candidate, reporting how many were actually READ. `totalFiles`
 * used to be `filesToScan.length` — the candidate count — so a scope of one
 * nonexistent path reported "1 file scanned, 0 findings" for a file the
 * verifier never opened. Coverage claims count bytes read, not paths offered
 * (#2070).
 */
function scanFiles(
  files: readonly string[],
  config: ResolvedDriftConfig
): { findings: DriftFinding[]; filesRead: number } {
  const findings: DriftFinding[] = [];
  let filesRead = 0;
  for (const file of files) {
    const result = scanFile(file, config);
    if (result === 'unreadable') continue;
    filesRead += 1;
    findings.push(...result);
  }
  return { findings, filesRead };
}

/**
 * Aggregate findings into the severity/code count maps used by the summary.
 */
function summarizeFindings(findings: readonly DriftFinding[]): {
  bySeverity: Record<DriftSeverity, number>;
  byCode: Record<string, number>;
} {
  const bySeverity: Record<DriftSeverity, number> = { error: 0, warn: 0, info: 0 };
  const byCode: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  return { bySeverity, byCode };
}

/**
 * Run the detect-design-drift verifier.
 */
export async function runDetectDrift(input: DetectDriftInput): Promise<DetectDriftOutput> {
  const startedAt = Date.now();
  const config = resolveDriftConfig(input);
  const rulesApplied = computeRulesApplied(config);

  const targets = collectDesignScanFiles(config.projectRoot, input.files, config.excludePatterns);
  const filesToScan = targets.files;
  // Truncated walk, or a design surface this verifier resolved down to nothing
  // (an exclude that matched everything, an explicit list that does not resolve,
  // or a dialect it cannot read). The rule lives in designScanAbstention so the
  // three verifiers cannot drift apart on it.
  const abstention = designScanAbstention('detect-design-drift', config.projectRoot, targets);
  if (abstention) throw abstention;
  const { findings, filesRead } = scanFiles(filesToScan, config);
  if (filesToScan.length > 0 && filesRead === 0) {
    throw noFilesScannedError('detect-design-drift', config.projectRoot);
  }
  const { bySeverity, byCode } = summarizeFindings(findings);

  return {
    findings,
    summary: {
      totalFiles: filesRead,
      durationMs: Date.now() - startedAt,
      bySeverity,
      byCode,
    },
    catalog: { rulesApplied },
    meta: {
      mode: config.mode,
      tokensLoaded: config.tokens !== null,
      registryLoaded: config.registry !== null,
      // Same condition collectDesignScanFiles uses to bypass the walk.
      excludePatterns:
        input.files !== undefined && input.files.length > 0 ? [] : [...config.excludePatterns],
    },
  };
}

export type {
  DriftFinding,
  DriftSeverity,
  DriftStrictness,
  DriftFindingCode,
} from './findings/finding.js';
