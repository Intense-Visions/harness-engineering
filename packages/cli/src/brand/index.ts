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
import { sanitizePath } from '../mcp/utils/sanitize-path.js';
import {
  collectDesignScanFiles,
  resolveDesignExcludePatterns,
} from '../shared/design-scan-targets.js';
import type { Verifier } from '../shared/verifier.js';
import type { BrandFinding, BrandSeverity, BrandStrictness } from './findings/finding.js';
import { loadBrandRules, type BrandRules } from './resolvers/design-md-brand.js';
import { loadBrandTokenIndex, type BrandTokenIndex } from './resolvers/token-extensions.js';
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

interface ResolvedOptions {
  mode: AuditBrandMode;
  strictness: BrandStrictness;
  tokenMisuseEnabled: boolean;
  voiceEnabled: boolean;
}

function resolveOptions(input: AuditBrandInput): ResolvedOptions {
  return {
    mode: input.mode ?? 'fast',
    strictness: input.designStrictness ?? 'standard',
    tokenMisuseEnabled: input.rules?.tokenMisuse !== false,
    voiceEnabled: input.rules?.voice !== false,
  };
}

export async function runAuditBrand(input: AuditBrandInput): Promise<AuditBrandOutput> {
  const startedAt = Date.now();
  const projectRoot = sanitizePath(input.path);
  const { mode, strictness, tokenMisuseEnabled, voiceEnabled } = resolveOptions(input);

  const brandRules = voiceEnabled ? loadBrandRules(projectRoot) : null;
  const brandTokens = tokenMisuseEnabled ? loadBrandTokenIndex(projectRoot) : null;

  const tokenActive = tokenMisuseEnabled && brandTokens !== null;
  const voiceActive = isVoiceRuleActive(voiceEnabled, brandRules);

  const rulesApplied: string[] = [];
  if (tokenActive) rulesApplied.push('token-misuse');
  if (voiceActive) rulesApplied.push('forbidden-phrases');

  // design.exclude ∪ analysis.exclude, resolved the same way detect-design-drift
  // and audit-component-anatomy resolve them, so one check-design run scans one
  // file set rather than three that drifted apart (#2070).
  const filesToScan = collectDesignScanFiles(
    projectRoot,
    input.files,
    resolveDesignExcludePatterns(projectRoot)
  );

  const findings = scanFiles(filesToScan, {
    tokenActive,
    voiceActive,
    brandTokens,
    brandRules,
    strictness,
  });

  return {
    findings,
    summary: {
      totalFiles: filesToScan.length,
      durationMs: Date.now() - startedAt,
      ...tallyFindings(findings),
    },
    catalog: { rulesApplied },
    meta: {
      mode,
      designMdLoaded: brandRules !== null,
      brandTokensLoaded: brandTokens !== null,
    },
  };
}

interface ScanContext {
  tokenActive: boolean;
  voiceActive: boolean;
  brandTokens: BrandTokenIndex | null;
  brandRules: BrandRules | null;
  strictness: BrandStrictness;
}

function isVoiceRuleActive(voiceEnabled: boolean, brandRules: BrandRules | null): boolean {
  return voiceEnabled && brandRules?.voice != null && brandRules.voice.forbiddenPhrases.length > 0;
}

function scanFiles(files: readonly string[], ctx: ScanContext): BrandFinding[] {
  const findings: BrandFinding[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    findings.push(...scanSource(source, file, ctx));
  }
  return findings;
}

function scanSource(source: string, file: string, ctx: ScanContext): BrandFinding[] {
  const findings: BrandFinding[] = [];
  if (ctx.tokenActive && ctx.brandTokens !== null) {
    findings.push(
      ...runTokenMisuseRule({
        source,
        file,
        brandTokens: ctx.brandTokens,
        strictness: ctx.strictness,
      })
    );
  }
  if (ctx.voiceActive && ctx.brandRules?.voice) {
    findings.push(
      ...runForbiddenPhrasesRule({
        source,
        file,
        forbiddenPhrases: ctx.brandRules.voice.forbiddenPhrases,
        strictness: ctx.strictness,
      })
    );
  }
  return findings;
}

function tallyFindings(findings: readonly BrandFinding[]): {
  bySeverity: Record<BrandSeverity, number>;
  byCode: Record<string, number>;
} {
  const bySeverity: Record<BrandSeverity, number> = { error: 0, warn: 0, info: 0 };
  const byCode: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  return { bySeverity, byCode };
}

export type {
  BrandFinding,
  BrandSeverity,
  BrandStrictness,
  BrandFindingCode,
} from './findings/finding.js';
