/**
 * Entry point for audit-brand-compliance — emits BrandFinding[] in the
 * Verifier<F> shape consumed by harness check-design as the 4th verifier.
 *
 * v1 scope (per spec):
 *   - BRAND-T001: token used in $extensions.harness.brand.forbidden_contexts
 *   - BRAND-V001: UI copy contains a voice.forbidden_phrases entry
 *
 * Source: docs/changes/design-pipeline/audit-brand-compliance/proposal.md
 *   (Technical Design → Module layout).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import type { Verifier } from '../shared/verifier.js';
import type { BrandFinding, BrandSeverity, BrandStrictness } from './findings/finding.js';
import { loadBrandRules } from './resolvers/design-md-brand.js';
import { loadBrandTokenIndex } from './resolvers/token-extensions.js';
import { runTokenMisuseRule } from './rules/token-misuse-rule.js';
import { runForbiddenPhrasesRule } from './rules/forbidden-phrases-rule.js';

export type AuditBrandMode = 'fast' | 'full';

export interface AuditBrandInput {
  path: string;
  mode?: AuditBrandMode;
  files?: string[];
  designStrictness?: BrandStrictness;
  rules?: {
    tokenMisuse?: boolean;
    voice?: boolean;
  };
}

export type AuditBrandOutput = Verifier<
  BrandFinding,
  { rulesApplied: string[] },
  { mode: AuditBrandMode; designMdLoaded: boolean; brandTokensLoaded: boolean }
>;

const DEFAULT_GLOB_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'];

export async function runAuditBrand(input: AuditBrandInput): Promise<AuditBrandOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const mode: AuditBrandMode = input.mode ?? 'fast';
  const strictness: BrandStrictness = input.designStrictness ?? 'standard';
  const tokenMisuseEnabled = input.rules?.tokenMisuse !== false;
  const voiceEnabled = input.rules?.voice !== false;

  const brandRules = voiceEnabled ? loadBrandRules(projectRoot) : null;
  const brandTokens = tokenMisuseEnabled ? loadBrandTokenIndex(projectRoot) : null;

  const rulesApplied: string[] = [];
  if (tokenMisuseEnabled && brandTokens !== null) rulesApplied.push('token-misuse');
  if (voiceEnabled && brandRules?.voice && brandRules.voice.forbiddenPhrases.length > 0) {
    rulesApplied.push('forbidden-phrases');
  }

  const filesToScan = collectFiles(projectRoot, input.files);

  const findings: BrandFinding[] = [];
  for (const file of filesToScan) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    if (tokenMisuseEnabled && brandTokens !== null) {
      findings.push(...runTokenMisuseRule({ source, file, brandTokens, strictness }));
    }
    if (voiceEnabled && brandRules?.voice && brandRules.voice.forbiddenPhrases.length > 0) {
      findings.push(
        ...runForbiddenPhrasesRule({
          source,
          file,
          forbiddenPhrases: brandRules.voice.forbiddenPhrases,
          strictness,
        })
      );
    }
  }

  const bySeverity: Record<BrandSeverity, number> = { error: 0, warn: 0, info: 0 };
  const byCode: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

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
      mode,
      designMdLoaded: brandRules !== null,
      brandTokensLoaded: brandTokens !== null,
    },
  };
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
    if (entry.isDirectory()) {
      walk(full, out, depth + 1);
    } else if (entry.isFile() && DEFAULT_GLOB_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
}

export type {
  BrandFinding,
  BrandSeverity,
  BrandStrictness,
  BrandFindingCode,
} from './findings/finding.js';
