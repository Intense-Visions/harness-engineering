/**
 * Pre-flight classifier — decides per-finding whether a codemod can
 * safely apply or whether to downgrade to a suggestion.
 *
 * Rules (per proposal.md → Pre-flight classifier rules):
 *
 *   DRIFT-T001 (hex)         safe iff: token import present
 *                                     AND hex is single string literal
 *                                     AND exactly one token matches by value
 *   DRIFT-T002 (font-family) safe iff: token import present
 *                                     AND family is single string literal
 *                                     AND exactly one token matches by value
 *   DRIFT-T003 (px spacing)  safe iff: token import present
 *                                     AND px value matches EXACTLY (no rounding)
 *                                     AND not in arithmetic expression
 *   DRIFT-T004 (deprecated)  always-suggestion (v1 never auto-applies)
 *   DRIFT-P*    (primitive)  always-suggestion (v1 never auto-applies)
 *
 * The classifier never reads the file from disk — callers provide source
 * text. Pure function for testability.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Pre-flight classifier rules).
 */

import type { DriftFinding } from '../../drift/findings/finding.js';
import type { TokenPathIndex } from '../../drift/resolvers/tokens.js';
import { findTokenImport, type TokenImportInfo } from './token-import.js';

export type Classification =
  | { kind: 'safe-codemod'; tokenImport: TokenImportInfo; tokenPath: string }
  | { kind: 'suggestion'; reason: string };

export interface ClassifyInput {
  finding: DriftFinding;
  source: string;
  /** Path-keyed token index from loadTokenPathIndex. Null when tokens.json absent. */
  tokenPaths: TokenPathIndex | null;
}

export function classifyFinding(input: ClassifyInput): Classification {
  const { finding } = input;

  // T004 + all P* are always suggestions in v1 (no inspection needed).
  if (finding.code === 'DRIFT-T004') {
    return {
      kind: 'suggestion',
      reason:
        'DRIFT-T004 is always a suggestion in v1 (migration target may not be in $description)',
    };
  }
  if (finding.code.startsWith('DRIFT-P')) {
    return {
      kind: 'suggestion',
      reason: `${finding.code} requires prop translation — v1 emits suggestion only`,
    };
  }

  // T001/T002/T003 path — require token import + tokens loaded + matching path
  if (input.tokenPaths === null) {
    return { kind: 'suggestion', reason: 'tokens.json not loaded' };
  }
  const tokenImport = findTokenImport(input.source);
  if (tokenImport === null) {
    return { kind: 'suggestion', reason: 'no recognized token import line in this file' };
  }

  if (finding.code === 'DRIFT-T001') {
    return classifyHex(input, tokenImport);
  }
  if (finding.code === 'DRIFT-T002') {
    return classifyFontFamily(input, tokenImport);
  }
  if (finding.code === 'DRIFT-T003') {
    return classifyPxSpacing(input, tokenImport);
  }

  return { kind: 'suggestion', reason: `unhandled finding code ${finding.code}` };
}

function classifyHex(input: ClassifyInput, tokenImport: TokenImportInfo): Classification {
  const hex = extractHexFromFinding(input.finding);
  if (hex === null) {
    return { kind: 'suggestion', reason: 'unable to extract hex value from finding evidence' };
  }
  if (isInTemplateOrExpression(input.source, input.finding.line, hex)) {
    return { kind: 'suggestion', reason: 'hex appears in template literal or expression context' };
  }
  const paths = input.tokenPaths!.colorPath.get(hex.toLowerCase()) ?? [];
  if (paths.length === 0) {
    return { kind: 'suggestion', reason: 'no token matches this hex value' };
  }
  if (paths.length > 1) {
    return {
      kind: 'suggestion',
      reason: `multiple tokens share this hex value (${paths.length}); ambiguous replacement`,
    };
  }
  return { kind: 'safe-codemod', tokenImport, tokenPath: paths[0]! };
}

function classifyFontFamily(input: ClassifyInput, tokenImport: TokenImportInfo): Classification {
  const family = extractFontFamilyFromFinding(input.finding);
  if (family === null) {
    return { kind: 'suggestion', reason: 'unable to extract font-family from finding evidence' };
  }
  if (isInTemplateOrExpression(input.source, input.finding.line, family)) {
    return { kind: 'suggestion', reason: 'font-family in template literal or expression context' };
  }
  const paths = input.tokenPaths!.fontFamilyPath.get(family.toLowerCase()) ?? [];
  if (paths.length === 0) {
    return { kind: 'suggestion', reason: 'no token matches this font-family' };
  }
  if (paths.length > 1) {
    return {
      kind: 'suggestion',
      reason: `multiple tokens share this font-family (${paths.length})`,
    };
  }
  return { kind: 'safe-codemod', tokenImport, tokenPath: paths[0]! };
}

function classifyPxSpacing(input: ClassifyInput, tokenImport: TokenImportInfo): Classification {
  const px = extractPxFromFinding(input.finding);
  if (px === null) {
    return { kind: 'suggestion', reason: 'unable to extract px value from finding evidence' };
  }
  if (isInArithmetic(input.source, input.finding.line, px)) {
    return { kind: 'suggestion', reason: 'px value appears inside an arithmetic expression' };
  }
  const paths = input.tokenPaths!.spacingPath.get(px) ?? [];
  if (paths.length === 0) {
    return {
      kind: 'suggestion',
      reason: 'no spacing token exactly matches this px value (no rounding in v1)',
    };
  }
  if (paths.length > 1) {
    return { kind: 'suggestion', reason: `multiple tokens share this px value (${paths.length})` };
  }
  return { kind: 'safe-codemod', tokenImport, tokenPath: paths[0]! };
}

// ─── extractors ──────────────────────────────────────────────────────────

function extractHexFromFinding(finding: DriftFinding): string | null {
  const m = /#[0-9a-fA-F]{3,8}/.exec(finding.message);
  return m ? m[0] : null;
}

function extractFontFamilyFromFinding(finding: DriftFinding): string | null {
  const m = /"([^"]+)"/.exec(finding.message);
  return m ? m[1]! : null;
}

function extractPxFromFinding(finding: DriftFinding): number | null {
  const m = /(\d+(?:\.\d+)?)px/.exec(finding.message);
  return m ? parseFloat(m[1]!) : null;
}

// ─── context probes (used to disqualify codemods) ────────────────────────

function isInTemplateOrExpression(source: string, line: number | null, value: string): boolean {
  if (line === null) return true;
  const lineText = sourceLine(source, line);
  // Template literal containing the value: detect backticks on the line
  if (lineText.includes('`') && lineText.includes(value)) return true;
  // Concatenation indicator next to the value: `... + "<value>"`
  if (lineText.includes('+ ') && lineText.includes(value)) return true;
  return false;
}

function isInArithmetic(source: string, line: number | null, value: number): boolean {
  if (line === null) return true;
  const lineText = sourceLine(source, line);
  // Crude probe: any of `+ - * /` adjacent to the px value
  const re = new RegExp(`\\b${value}px\\b\\s*[+\\-*/]|[+\\-*/]\\s*\\b${value}px\\b`);
  return re.test(lineText);
}

function sourceLine(source: string, line: number): string {
  const lines = source.split('\n');
  return lines[line - 1] ?? '';
}
