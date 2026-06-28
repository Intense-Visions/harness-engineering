/**
 * ANAT-P* pattern catalog — "missing-anatomy-component" composition patterns.
 *
 * Where conventions (ANAT-D*) check a component *definition* for required parts,
 * patterns (ANAT-P*) check *composition* sites for missing affordances: a list
 * rendered with no empty state, an async fetch with no loading boundary, etc.
 * (proposal.md Decision #2 — the "blue-ocean" finding class.)
 *
 * v1 ships two flagship patterns via conservative source heuristics (no
 * tree-sitter dependency): a finding fires only when the triggering construct is
 * present AND no mitigating affordance appears anywhere in the file, which keeps
 * false positives low at the cost of missing intra-file edge cases. Each finding
 * is `warn` severity and carries a manual fix hint. The `PatternCheck` shape is
 * the extension point for the remaining catalog (P003+).
 */

import type { AnatomyFinding } from '../../findings/finding.js';

export interface PatternCheck {
  code: AnatomyFinding['code'];
  /** Stable slug surfaced in `summary.catalog.patternsApplied`. */
  id: string;
  /** Authoritative citation written into `finding.rule.source`. */
  source: string;
  /** Scan a file's source; return zero or more findings (file path pre-resolved). */
  detect(file: string, contents: string, componentType: string | null): AnatomyFinding[];
}

/** 1-indexed line number of a character offset. */
function lineAt(contents: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < contents.length; i++) {
    if (contents[i] === '\n') line += 1;
  }
  return line;
}

const anyMatch = (contents: string, res: RegExp[]): boolean => res.some((re) => re.test(contents));

function makeFinding(
  pattern: PatternCheck,
  file: string,
  contents: string,
  matchIndex: number,
  componentType: string | null,
  message: string,
  fixDescription: string
): AnatomyFinding {
  const line = lineAt(contents, matchIndex);
  const snippet = (contents.split('\n')[line - 1] ?? '').trim();
  return {
    code: pattern.code,
    severity: 'warn',
    file,
    line,
    componentType,
    message,
    evidence: { snippet },
    rule: { id: pattern.code, source: pattern.source },
    fix: { kind: 'manual', description: fixDescription },
  };
}

/**
 * ANAT-P001 — a list is rendered with `.map(...)` but the file has no empty-state
 * branch (length-zero guard, `EmptyState`, "no results" copy). A list that can be
 * empty needs a designed empty state.
 */
const mapWithoutEmpty: PatternCheck = {
  code: 'ANAT-P001',
  id: 'map-without-empty',
  source: 'design-component-anatomy/pattern-map-without-empty',
  detect(file, contents, componentType) {
    const mapCall = /\.map\s*\(/.exec(contents);
    if (!mapCall) return [];
    const emptyGuards = [
      /\.length\s*===\s*0/,
      /\.length\s*<\s*1/,
      /\.length\s*>\s*0/,
      /\.length\s*\?/,
      /\blength\s*&&/,
      /\?\.length\b/,
      /\bisEmpty\b/,
      /\bEmptyState\b/,
      /\bno\s+(results|items|data|entries)\b/i,
    ];
    if (anyMatch(contents, emptyGuards)) return [];
    return [
      makeFinding(
        mapWithoutEmpty,
        file,
        contents,
        mapCall.index,
        componentType,
        'List rendered with `.map(...)` but no empty state was found. An empty list ' +
          'renders as a blank region — add a length-zero branch (e.g. an EmptyState).',
        'Guard the list: `items.length === 0 ? <EmptyState/> : items.map(...)`.'
      ),
    ];
  },
};

/**
 * ANAT-P002 — the file performs async data loading (fetch / query hook / awaited
 * effect) but renders no loading affordance (spinner, skeleton, Suspense,
 * `isLoading`). An async surface with no loading boundary flashes empty/janky.
 */
const fetchWithoutLoading: PatternCheck = {
  code: 'ANAT-P002',
  id: 'fetch-without-loading',
  source: 'design-component-anatomy/pattern-fetch-without-loading',
  detect(file, contents, componentType) {
    const asyncSignals = [
      /\bfetch\s*\(/,
      /\buse(Query|SWR|Swr|Mutation)\b/,
      /\baxios\s*[.(]/,
      /\bawait\s+/,
    ];
    const trigger = asyncSignals.map((re) => re.exec(contents)).find((m) => m !== null);
    if (!trigger) return [];
    const loadingSignals = [
      /\bis?Loading\b/i,
      /\bisPending\b/i,
      /\bpending\b/i,
      /\bSkeleton\b/,
      /\bSpinner\b/,
      /<Suspense\b/,
      /\bplaceholder\b/i,
    ];
    if (anyMatch(contents, loadingSignals)) return [];
    return [
      makeFinding(
        fetchWithoutLoading,
        file,
        contents,
        trigger.index,
        componentType,
        'Async data loading found but no loading state. The surface renders empty ' +
          'until data resolves — add a loading boundary (skeleton, spinner, or Suspense).',
        'Render a loading affordance while the request is in flight ' +
          '(e.g. `if (isLoading) return <Skeleton/>`).'
      ),
    ];
  },
};

/** The v1 ANAT-P* catalog, in stable order. */
export const PATTERN_CHECKS: readonly PatternCheck[] = [mapWithoutEmpty, fetchWithoutLoading];
