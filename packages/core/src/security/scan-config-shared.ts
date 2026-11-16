/**
 * Shared scan-config types and utilities.
 * Used by both the CLI `harness scan-config` command and the orchestrator workspace scanner.
 */

import { getInjectionPatterns } from './injection-patterns';
import type { InjectionFinding } from './injection-patterns';
import type { SecurityFinding } from './types';

export interface ScanConfigFinding {
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  match: string;
  line?: number;
}

export interface ScanConfigFileResult {
  file: string;
  findings: ScanConfigFinding[];
  overallSeverity: 'high' | 'medium' | 'low' | 'clean';
}

export interface ScanConfigResult {
  exitCode: number;
  results: ScanConfigFileResult[];
}

export function mapSecuritySeverity(severity: string): 'high' | 'medium' | 'low' {
  if (severity === 'error') return 'high';
  if (severity === 'warning') return 'medium';
  return 'low';
}

export function computeOverallSeverity(
  findings: ScanConfigFinding[]
): 'high' | 'medium' | 'low' | 'clean' {
  if (findings.length === 0) return 'clean';
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

export function computeScanExitCode(results: ScanConfigFileResult[]): number {
  for (const r of results) {
    if (r.overallSeverity === 'high') return 2;
  }
  for (const r of results) {
    if (r.overallSeverity === 'medium') return 1;
  }
  return 0;
}

export function mapInjectionFindings(injectionFindings: InjectionFinding[]): ScanConfigFinding[] {
  return injectionFindings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity as 'high' | 'medium' | 'low',
    message: `Injection pattern detected: ${f.ruleId}`,
    match: f.match,
    ...(f.line !== undefined ? { line: f.line } : {}),
  }));
}

export function isDuplicateFinding(
  existing: ScanConfigFinding[],
  secFinding: SecurityFinding
): boolean {
  return existing.some(
    (e) =>
      e.line === secFinding.line &&
      e.match === secFinding.match.trim() &&
      e.ruleId.split('-')[0] === secFinding.ruleId.split('-')[0]
  );
}

export function mapSecurityFindings(
  secFindings: SecurityFinding[],
  existing: ScanConfigFinding[]
): ScanConfigFinding[] {
  const result: ScanConfigFinding[] = [];
  for (const f of secFindings) {
    if (!isDuplicateFinding(existing, f)) {
      result.push({
        ruleId: f.ruleId,
        severity: mapSecuritySeverity(f.severity),
        message: f.message,
        match: f.match,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
  }
  return result;
}

// --- Markdown awareness (#2052) ---------------------------------------------
//
// CLAUDE.md / AGENTS.md are Markdown documentation. Two of their structures are
// not live text, and three rules read them as if they were:
//  - Table syntax: the cell-edge padding that aligns columns and the `---`
//    separator row match INJ-SUS-001 (whitespace run) and INJ-SUS-002
//    (repeated delimiters).
//  - Fenced code SAMPLES: column-aligned comments and ASCII trees match the
//    INJ-SUS rules, and a quoted `readFileSync(p + f)` matches SEC-PTH-001, a
//    source-code rule. A doc that documents file handling cannot avoid it.
// Only those rules are exempted, and only from those structures. Every other
// injection rule (re-roling, permission escalation, ...) still fires inside
// tables and fences, because the agent still reads that text.

/** Rules that read Markdown table syntax as obfuscation, with their own patterns. */
const TABLE_SYNTAX_RULES: ReadonlyMap<string, RegExp> = new Map(
  getInjectionPatterns()
    .filter((p) => p.ruleId === 'INJ-SUS-001' || p.ruleId === 'INJ-SUS-002')
    .map((p) => [p.ruleId, p.pattern])
);

/** Rules exempt inside a fenced code sample. */
function isFenceExemptRule(ruleId: string): boolean {
  return TABLE_SYNTAX_RULES.has(ruleId) || ruleId.startsWith('SEC-PTH-');
}

// Any indentation: fences nested in list items are routinely indented past 3.
const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const TABLE_SEPARATOR_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

export function isMarkdownPath(filePath: string): boolean {
  return /\.(?:md|markdown|mdx)$/i.test(filePath);
}

/**
 * 1-based line numbers that sit inside a fenced code block, fence lines
 * included. Follows CommonMark: a fence closes on the same character at least
 * as long as the opener; an unclosed fence runs to end of file.
 */
export function findFencedCodeLines(content: string): Set<number> {
  const fenced = new Set<number>();
  const lines = content.split('\n');
  let open: { char: string; length: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i]!);
    if (open === null) {
      if (m) {
        open = { char: m[1]![0]!, length: m[1]!.length };
        fenced.add(i + 1);
      }
      continue;
    }
    fenced.add(i + 1);
    const rest = m ? lines[i]!.trim().slice(m[1]!.length) : '';
    if (m && m[1]![0] === open.char && m[1]!.length >= open.length && rest.trim() === '') {
      open = null;
    }
  }
  return fenced;
}

/**
 * Strip a Markdown table row down to its cell CONTENT: a separator row becomes
 * empty, and the whitespace padding at each cell edge collapses. Whitespace or
 * delimiter runs inside a cell's own text survive, so they still match.
 * Returns null when the line is not a table row.
 */
export function normalizeMarkdownTableRow(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  if (TABLE_SEPARATOR_ROW.test(trimmed)) return '';
  if (!trimmed.startsWith('|')) return null;
  return trimmed.replace(/\s*\|\s*/g, ' | ').trim();
}

/**
 * Drop the findings that only matched Markdown structure (#2052). A no-op for
 * non-Markdown files and for findings without a line number.
 */
export function suppressMarkdownStructureFindings(
  findings: ScanConfigFinding[],
  content: string,
  filePath: string
): ScanConfigFinding[] {
  if (!isMarkdownPath(filePath)) return findings;
  const lines = content.split('\n');
  const fenced = findFencedCodeLines(content);
  return findings.filter((f) => {
    if (f.line === undefined) return true;
    if (fenced.has(f.line)) return !isFenceExemptRule(f.ruleId);
    const pattern = TABLE_SYNTAX_RULES.get(f.ruleId);
    if (!pattern) return true;
    const cells = normalizeMarkdownTableRow(lines[f.line - 1] ?? '');
    return cells === null || pattern.test(cells);
  });
}
