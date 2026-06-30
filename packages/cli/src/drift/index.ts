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
import * as path from 'node:path';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
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
}

import type { Verifier } from '../shared/verifier.js';

// Conforms to the shared Verifier<F, Cat, Meta> shape extracted at the
// 4th-verifier threshold (audit-brand-compliance).
export type DetectDriftOutput = Verifier<
  DriftFinding,
  { rulesApplied: string[] },
  { mode: DetectDriftMode; tokensLoaded: boolean; registryLoaded: boolean }
>;

const DEFAULT_GLOB_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'];

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
}

/**
 * Resolve input defaults and load the token/registry resources.
 */
function resolveDriftConfig(input: DetectDriftInput): ResolvedDriftConfig {
  const projectRoot = sanitizePath(input.path);
  const tokenBypassEnabled = input.rules?.tokenBypass !== false;
  const primitiveAdoptionEnabled = input.rules?.primitiveAdoption !== false;
  return {
    projectRoot,
    mode: input.mode ?? 'fast',
    strictness: input.designStrictness ?? 'standard',
    tokenBypassEnabled,
    primitiveAdoptionEnabled,
    tokens: tokenBypassEnabled ? loadTokenSet(projectRoot) : null,
    registry: primitiveAdoptionEnabled ? loadComponentRegistry(projectRoot) : null,
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

  const filesToScan = await collectFiles(config.projectRoot, input.files);
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

/**
 * Collect candidate files for scanning. Honors the optional files arg
 * (explicit paths). Falls back to a simple walk of the project root when
 * not provided.
 */
async function collectFiles(
  projectRoot: string,
  explicitFiles: readonly string[] | undefined
): Promise<string[]> {
  if (explicitFiles !== undefined && explicitFiles.length > 0) {
    return explicitFiles.map((f) => (path.isAbsolute(f) ? f : path.join(projectRoot, f)));
  }
  const out: string[] = [];
  walk(projectRoot, out, 0);
  return out;
}

function walk(dir: string, out: string[], depth: number): void {
  // Bounded depth + skip common heavy / generated dirs for performance.
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
    if (entry.isDirectory()) {
      walk(full, out, depth + 1);
    } else if (entry.isFile() && DEFAULT_GLOB_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
}

export type {
  DriftFinding,
  DriftSeverity,
  DriftStrictness,
  DriftFindingCode,
} from './findings/finding.js';
