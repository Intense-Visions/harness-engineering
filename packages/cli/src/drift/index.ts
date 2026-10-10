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
  { mode: DetectDriftMode; tokensLoaded: boolean; registryLoaded: boolean }
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
function scanFile(file: string, config: ResolvedDriftConfig): DriftFinding[] {
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf-8');
  } catch {
    return [];
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
function scanFiles(files: readonly string[], config: ResolvedDriftConfig): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const file of files) {
    findings.push(...scanFile(file, config));
  }
  return findings;
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

  const filesToScan = collectDesignScanFiles(
    config.projectRoot,
    input.files,
    config.excludePatterns
  );
  const findings = scanFiles(filesToScan, config);
  const { bySeverity, byCode } = summarizeFindings(findings);

  return {
    findings,
    summary: {
      totalFiles: filesToScan.length,
      durationMs: Date.now() - startedAt,
      bySeverity,
      byCode,
    },
    catalog: { rulesApplied },
    meta: {
      mode: config.mode,
      tokensLoaded: config.tokens !== null,
      registryLoaded: config.registry !== null,
    },
  };
}

export type {
  DriftFinding,
  DriftSeverity,
  DriftStrictness,
  DriftFindingCode,
} from './findings/finding.js';
