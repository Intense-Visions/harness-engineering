/**
 * DRIFT-T* — Token bypass detection.
 *
 * Scans source files for hardcoded values where a design token should be
 * used. Pattern detection is regex-based (mirrors legacy DESIGN-001/002
 * approach in DesignConstraintAdapter; v1 doesn't need richer parsing
 * for these checks).
 *
 * Codes:
 *   DRIFT-T001 — hex color outside palette
 *   DRIFT-T002 — font-family outside declared palette
 *   DRIFT-T003 — pixel margin/padding outside declared spacing scale
 *   DRIFT-T004 — reference to a deprecated token (e.g. CSS var or token-name string)
 *
 * Inputs:
 *   - TokenSet from resolvers/tokens.ts (returns null when tokens.json absent)
 *
 * Behavior when tokens.json absent: all 4 rules skip silently (no findings).
 * This is intentional — projects without a token system have nothing to bypass.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Code namespace → DRIFT-T*).
 */

import type { DriftFinding, DriftStrictness } from '../findings/finding.js';
import { severityFor } from '../findings/finding.js';
import type { TokenSet } from '../resolvers/tokens.js';

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const FONT_FAMILY_PATTERN = /(?:fontFamily|font-family)\s*[:=]\s*['"`]([^'"`,]+)['"`]/g;
const PX_VALUE_PATTERN =
  /\b(?:margin(?:Top|Right|Bottom|Left)?|padding(?:Top|Right|Bottom|Left)?|gap|top|right|bottom|left)\s*[:=]\s*['"`]?(\d+(?:\.\d+)?)px\b/g;

export interface TokenBypassRuleInput {
  source: string;
  file: string;
  tokens: TokenSet;
  strictness: DriftStrictness;
}

export function runTokenBypassRule(input: TokenBypassRuleInput): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const { source, file, tokens, strictness } = input;

  findings.push(...detectHexBypass(source, file, tokens, strictness));
  findings.push(...detectFontFamilyBypass(source, file, tokens, strictness));
  findings.push(...detectPxSpacingBypass(source, file, tokens, strictness));
  findings.push(...detectDeprecatedTokenUsage(source, file, tokens, strictness));

  return findings;
}

function detectHexBypass(
  source: string,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const seenAtLine = new Set<string>();
  let match: RegExpExecArray | null;
  HEX_PATTERN.lastIndex = 0;
  while ((match = HEX_PATTERN.exec(source)) !== null) {
    const hex = match[0]!;
    const lc = hex.toLowerCase();
    if (tokens.colors.has(lc)) continue;
    const line = lineOf(source, match.index);
    const key = `${line}:${lc}`;
    if (seenAtLine.has(key)) continue; // dedupe per line+value
    seenAtLine.add(key);
    findings.push({
      code: 'DRIFT-T001',
      severity: severityFor('DRIFT-T001', strictness),
      file,
      line,
      message: `Hardcoded color "${hex}" is not in the design token palette`,
      evidence: { snippet: extractLine(source, match.index) },
      rule: { id: 'DRIFT-T001', category: 'token-bypass' },
      fix: {
        kind: 'codemod-todo',
        description: `Replace "${hex}" with a token reference (e.g. var(--color-...) or a token-system lookup). If the color is intentionally one-off, add it to tokens.json first.`,
      },
    });
  }
  return findings;
}

function detectFontFamilyBypass(
  source: string,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  FONT_FAMILY_PATTERN.lastIndex = 0;
  while ((match = FONT_FAMILY_PATTERN.exec(source)) !== null) {
    const family = match[1]!.trim();
    const lc = family.toLowerCase();
    // Common system fallbacks are always allowed
    if (['inherit', 'sans-serif', 'serif', 'monospace', 'system-ui'].includes(lc)) continue;
    if (tokens.fontFamilies.has(lc)) continue;
    if (seen.has(lc)) continue;
    seen.add(lc);
    const line = lineOf(source, match.index);
    findings.push({
      code: 'DRIFT-T002',
      severity: severityFor('DRIFT-T002', strictness),
      file,
      line,
      message: `Font-family "${family}" is not in the typography token palette`,
      evidence: { snippet: extractLine(source, match.index) },
      rule: { id: 'DRIFT-T002', category: 'token-bypass' },
      fix: {
        kind: 'codemod-todo',
        description: `Replace "${family}" with a typography token (e.g. token typography.body.fontFamily) or add it to tokens.json if it's an intentional addition.`,
      },
    });
  }
  return findings;
}

function detectPxSpacingBypass(
  source: string,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  // Skip if no spacing tokens — the project might use a free-form scale
  if (tokens.spacingPx.size === 0) return findings;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  PX_VALUE_PATTERN.lastIndex = 0;
  while ((match = PX_VALUE_PATTERN.exec(source)) !== null) {
    const value = parseFloat(match[1]!);
    if (tokens.spacingPx.has(value)) continue;
    const line = lineOf(source, match.index);
    const key = `${line}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      code: 'DRIFT-T003',
      severity: severityFor('DRIFT-T003', strictness),
      file,
      line,
      message: `Spacing value ${value}px is not in the spacing scale (${[...tokens.spacingPx].sort((a, b) => a - b).join('px, ')}px)`,
      evidence: { snippet: extractLine(source, match.index) },
      rule: { id: 'DRIFT-T003', category: 'token-bypass' },
      fix: {
        kind: 'codemod-todo',
        description: `Round ${value}px to the nearest spacing-scale value, or add it to tokens.json if intentional.`,
      },
    });
  }
  return findings;
}

function detectDeprecatedTokenUsage(
  source: string,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  if (tokens.deprecatedTokens.size === 0) return findings;
  for (const tokenPath of tokens.deprecatedTokens) {
    // Look for the token path used as a string literal (token references like
    // 'color.brand.500' or var(--color-brand-500) — match both literal path
    // form and css-var-kebab form)
    const patterns = [
      new RegExp(`['"\`]${escapeRegex(tokenPath)}['"\`]`, 'g'),
      new RegExp(`--${escapeRegex(tokenPath.replace(/\./g, '-'))}\\b`, 'g'),
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const line = lineOf(source, match.index);
        findings.push({
          code: 'DRIFT-T004',
          severity: severityFor('DRIFT-T004', strictness),
          file,
          line,
          message: `Token "${tokenPath}" is deprecated and should be migrated`,
          evidence: { snippet: extractLine(source, match.index) },
          rule: { id: 'DRIFT-T004', category: 'token-bypass' },
          fix: {
            kind: 'codemod-todo',
            description: `Migrate references to "${tokenPath}" to the replacement token noted in tokens.json $description, or remove the deprecation if the token is still load-bearing.`,
          },
        });
      }
    }
  }
  return findings;
}

// ─── helpers ───────────────────────────────────────────

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractLine(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset) + 1;
  const endIdx = source.indexOf('\n', offset);
  const end = endIdx === -1 ? source.length : endIdx;
  return source.slice(start, end).trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
