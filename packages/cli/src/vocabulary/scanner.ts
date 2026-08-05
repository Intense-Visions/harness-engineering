// Semantic-vocabulary scanner — the pure engine behind `harness check-vocabulary`,
// the adopter-facing gate that fails when a deprecated or renamed canonical term
// reappears in an adopter's skills/docs prose, guarding a glossary or naming
// investment from vocabulary drift over time.
//
// Ships in @harness-engineering/cli so any project that adopts harness can run it
// against its own `harness.config.json` `vocabulary` block. The rule set and scan
// scope come from config; this module is pure logic so it can be unit-tested
// against fixtures independent of any real repo.
//
// Design constraints (low false-positive by construction):
//   - Prose-only: fenced code blocks (``` / ~~~) and inline code spans (`...`) are
//     stripped before matching, so a legitimate identifier mention never trips the
//     gate. Line numbers are preserved against the original file.
//   - Word-boundary matching, case-insensitive by default — "codebase" never
//     matches the "code base" rule, and a substring inside a larger word is ignored.
//   - Per-rule `allow` regex sources let a rule exempt a known-legitimate context.

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { glob } from 'glob';

/** One deprecated → canonical vocabulary mapping. */
export interface VocabularyRule {
  /** The deprecated / renamed term that must no longer appear in prose. */
  readonly deprecated: string;
  /** The canonical term to suggest in its place. */
  readonly canonical: string;
  /** Why the term was deprecated — shown in the failure message. */
  readonly reason?: string | undefined;
  /**
   * Optional regex sources that exempt a legitimate occurrence. If any matches the
   * line (original, pre-strip), the hit on that line is not reported. Compiled
   * case-insensitively. Use sparingly. Sourced from config as plain strings so the
   * rule set is fully expressible in JSON.
   */
  readonly allow?: readonly string[] | undefined;
}

/** What files the gate scans and which surfaces it deliberately skips. */
export interface ScanConfig {
  /** Glob patterns (relative to root) of files to scan. */
  readonly include: readonly string[];
  /**
   * Glob patterns (relative to root) to exclude. Historical/archival/competitor
   * surfaces (ADRs, change deltas, research analyses) legitimately reference old
   * or external vocabulary and must not be treated as drift.
   */
  readonly exclude: readonly string[];
}

/** A single deprecated-term occurrence found by the scanner. */
export interface Violation {
  /** Repo-relative, forward-slash-normalized path. */
  readonly file: string;
  /** 1-based line number in the original file. */
  readonly line: number;
  readonly deprecated: string;
  readonly canonical: string;
  readonly reason?: string;
  /** The matched line, trimmed, for context in the failure message. */
  readonly excerpt: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a case-insensitive, word-boundary-anchored matcher for a term. Interior
 * whitespace in a multi-word term matches any run of whitespace so "code   base"
 * (or a wrapped line normalized to a single space) is still caught.
 */
function buildMatcher(deprecated: string): RegExp {
  const pattern = escapeRegExp(deprecated).replace(/\\?\s+/g, '\\s+');
  return new RegExp(`\\b${pattern}\\b`, 'i');
}

/** Compile a rule's `allow` sources into case-insensitive matchers (once per scan). */
function compileAllow(allow: readonly string[] | undefined): RegExp[] {
  return (allow ?? []).map((src) => new RegExp(src, 'i'));
}

/**
 * Strip Markdown code from a line array while preserving indices (each stripped
 * line becomes '' so line numbers still line up with the original file).
 *   - Fenced blocks: everything between matching ``` or ~~~ fences (inclusive).
 *   - Inline code: `...` spans within a surviving line.
 */
function stripCode(lines: readonly string[]): string[] {
  const out: string[] = [];
  let fence: string | null = null;

  for (const raw of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) {
      // Inside a fenced block: blank the line; close if the fence char repeats.
      out.push('');
      if (fenceMatch && fenceMatch[1]!.startsWith(fence[0]!)) fence = null;
      continue;
    }
    if (fenceMatch) {
      out.push('');
      fence = fenceMatch[1]!;
      continue;
    }
    // Not fenced: drop inline-code spans, keep the rest of the prose.
    out.push(raw.replace(/`[^`]*`/g, ' '));
  }

  return out;
}

/** Scan already-loaded text (used by unit tests and by {@link scanFiles}). */
export function scanText(
  file: string,
  content: string,
  rules: readonly VocabularyRule[]
): Violation[] {
  const original = content.split('\n');
  const prose = stripCode(original);
  const violations: Violation[] = [];

  for (const rule of rules) {
    const matcher = buildMatcher(rule.deprecated);
    const allow = compileAllow(rule.allow);
    for (let i = 0; i < prose.length; i++) {
      if (!matcher.test(prose[i]!)) continue;
      const originalLine = original[i]!;
      if (allow.some((re) => re.test(originalLine))) continue;
      violations.push({
        file,
        line: i + 1,
        deprecated: rule.deprecated,
        canonical: rule.canonical,
        ...(rule.reason !== undefined && { reason: rule.reason }),
        excerpt: originalLine.trim(),
      });
    }
  }

  return violations;
}

/** Resolve the configured globs to a de-duplicated, sorted list of absolute files. */
export async function resolveScanFiles(root: string, scan: ScanConfig): Promise<string[]> {
  const matches = await glob([...scan.include], {
    cwd: root,
    absolute: true,
    ignore: [...scan.exclude],
    nodir: true,
  });
  return [...new Set(matches)].sort();
}

/** Scan every configured file under `root` and return all violations. */
export async function scanFiles(
  root: string,
  scan: ScanConfig,
  rules: readonly VocabularyRule[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const absPath of await resolveScanFiles(root, scan)) {
    const rel = relative(root, absPath).replaceAll('\\', '/');
    violations.push(...scanText(rel, readFileSync(resolve(absPath), 'utf-8'), rules));
  }
  return violations;
}

/** Render violations as a human-readable, actionable failure message. */
export function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => {
      const because = v.reason ? ` (${v.reason})` : '';
      return (
        `  ${v.file}:${v.line} — "${v.deprecated}" is deprecated; use "${v.canonical}"` +
        `${because}\n    ${v.excerpt}`
      );
    })
    .join('\n');
}
