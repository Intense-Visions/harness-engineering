/**
 * BRAND-T* — Token misuse detection.
 *
 * For each token whose $extensions.harness.brand.forbidden_contexts is
 * non-empty, scan source for references to that token's dotted path
 * (recognized in three forms: tokens.X.Y.Z, var(--X-Y-Z), 'X.Y.Z'). If
 * the surrounding source context contains any forbidden-context keyword,
 * emit BRAND-T001.
 *
 * v1 context inference is intentionally simple: same line + immediately
 * adjacent non-blank lines. Misses far-context cases by design; near-zero
 * false positives is the contract.
 *
 * Vocabulary v1 recognizes (matches ADR 0028 sketch): cta, selection,
 * focus, data-visualization, decorative, background, text, border, error,
 * success, warning.
 *
 * Source: docs/changes/design-pipeline/audit-brand-compliance/proposal.md
 *   (Technical Design → BRAND-T* token-misuse rule).
 */

import type { BrandFinding, BrandStrictness } from '../findings/finding.js';
import { severityFor } from '../findings/finding.js';
import type { BrandTokenIndex } from '../resolvers/token-extensions.js';

export interface TokenMisuseRuleInput {
  source: string;
  file: string;
  brandTokens: BrandTokenIndex;
  strictness: BrandStrictness;
}

export function runTokenMisuseRule(input: TokenMisuseRuleInput): BrandFinding[] {
  const findings: BrandFinding[] = [];
  const { source, file, brandTokens, strictness } = input;
  for (const info of brandTokens.byPath.values()) {
    if (info.forbiddenContexts.length === 0) continue;
    for (const reference of findTokenReferences(source, info.path)) {
      const context = inferContext(source, reference.line);
      const hit = info.forbiddenContexts.find((ctx) => context.includes(ctx.toLowerCase()));
      if (hit === undefined) continue;
      findings.push({
        code: 'BRAND-T001',
        severity: severityFor('BRAND-T001', strictness),
        file,
        line: reference.line,
        message: `Token "${info.path}" is used in forbidden context "${hit}" — declared at $extensions.harness.brand.forbidden_contexts`,
        evidence: { snippet: reference.snippet },
        rule: { id: 'BRAND-T001', category: 'token-misuse' },
        fix: {
          kind: 'manual',
          description: `Token "${info.path}" is not approved for the "${hit}" context. Use an approved token (allowed contexts: ${
            info.approvedContexts.length > 0 ? info.approvedContexts.join(', ') : '(none declared)'
          }), or update tokens.json $extensions.harness.brand if the policy is wrong.`,
        },
      });
    }
  }
  return findings;
}

interface TokenReference {
  line: number;
  snippet: string;
}

/**
 * Find each line referencing the given token path. Recognizes:
 *   - tokens.color.brand.500 (JS-style accessor)
 *   - var(--color-brand-500)  (CSS-var kebab)
 *   - 'color.brand.500' / "color.brand.500" (string literal)
 *
 * Returns at most one reference per line per call site (deduped).
 */
function findTokenReferences(source: string, tokenPath: string): TokenReference[] {
  const refs: TokenReference[] = [];
  const seen = new Set<number>();
  const escaped = escapeRegex(tokenPath);
  const kebab = tokenPath.replace(/\./g, '-');
  const escapedKebab = escapeRegex(kebab);
  const patterns = [
    new RegExp(`\\btokens\\.${escaped}\\b`, 'g'),
    new RegExp(`var\\(\\s*--${escapedKebab}\\s*\\)`, 'g'),
    new RegExp(`['"\`]${escaped}['"\`]`, 'g'),
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const line = lineOf(source, match.index);
      if (seen.has(line)) continue;
      seen.add(line);
      refs.push({ line, snippet: extractLine(source, match.index) });
    }
  }
  return refs;
}

/**
 * Inspect the source context around `line`: the line itself plus the
 * nearest non-blank previous and next lines. Returns the concatenated
 * lowercase text (used for substring matching against the
 * forbidden-context vocabulary).
 */
function inferContext(source: string, line: number): string {
  const lines = source.split('\n');
  const idx = line - 1;
  const parts: string[] = [];
  // Self
  if (lines[idx] !== undefined) parts.push(lines[idx]);
  // Previous non-blank
  for (let i = idx - 1; i >= 0 && i >= idx - 3; i--) {
    if (lines[i]!.trim().length > 0) {
      parts.push(lines[i]!);
      break;
    }
  }
  // Next non-blank
  for (let i = idx + 1; i < lines.length && i <= idx + 3; i++) {
    if (lines[i]!.trim().length > 0) {
      parts.push(lines[i]!);
      break;
    }
  }
  return parts.join(' ').toLowerCase();
}

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
