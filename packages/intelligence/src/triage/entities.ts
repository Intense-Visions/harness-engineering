// packages/intelligence/src/triage/entities.ts
//
// Roadmap Auto-Triage — Phase 0, Contract 4: the shared entity extractor.
//
// A pure util turning a roadmap row's title/description into candidate symbol/path
// names for the scope lever's graph lookup (compute_blast_radius / get_impact /
// find_context_for). Deliberately NAIVE — four structured signal shapes only:
//   1. backticked tokens        `like this`
//   2. path/like/this           packages/core/src/foo.ts, src/nlq/EntityExtractor
//   3. CamelCase / PascalCase   BackendRouter, shapeKey
//   4. dotted/scoped identifiers foo.bar, Class.method, @scope/pkg
//
// It does NOT do a noun/keyword fallback (unlike graph's NLQ EntityExtractor): an item
// with none of these shapes yields an EXPLICIT empty result, which P1's scope lever
// turns into `unresolved-scope` (→ human), NEVER a length/noun proxy. This is
// load-bearing: a weak extractor collapses the scope lever, so it ships here with its
// own tests rather than buried in P1. NLQ (packages/graph/src/nlq/) is the later upgrade.
//
// Layer note: pure, zero dependencies. No graph/core import (the resolution against the
// graph is the scope lever's job in P1, not this extractor's).

/** Backticked spans: `renderRow`, `docs/architecture.md`. Highest-signal — author-marked. */
const BACKTICKED_RE = /`([^`]+)`/g;

/**
 * File-ish paths: a segment containing `/` (optionally `./`-prefixed) and made of
 * path-safe characters. Matches `packages/core/src/foo.ts` and bare `src/nlq/Resolver`
 * (extension optional — roadmap prose often drops it).
 */
const PATH_RE = /(?:\.\/)?(?:[A-Za-z0-9_@.-]+\/)+[A-Za-z0-9_.-]+/g;

/**
 * CamelCase / PascalCase identifiers: `BackendRouter`, `shapeKey`, `autoTriage`.
 * Requires an internal case transition so plain lowercase words and ALL-CAPS
 * acronyms don't match.
 */
const CAMEL_RE = /\b([A-Z][a-z]+[A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[a-z]+[A-Z][A-Za-z0-9]*)\b/g;

/**
 * Dotted/scoped identifiers: `foo.bar`, `Class.method`, `@harness-engineering/core`.
 * (The scoped-package form is also caught by PATH_RE via its `/`; dotted member access
 * is the distinct case here.)
 */
const DOTTED_RE = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+\b/g;

/**
 * Extract candidate entity mentions (symbol/path names) from roadmap-row text.
 *
 * Pure and deterministic: returns de-duplicated candidates in first-seen order across
 * the four strategies. Returns an EMPTY array when the text carries none of the
 * structured shapes — the explicit "no entities found" signal P1 relies on (it becomes
 * `unresolved-scope`, never a fallback). Non-string / empty input ⇒ `[]`.
 */
export function extractEntities(text: string): string[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  const add = (raw: string): void => {
    const token = raw.trim();
    if (token.length === 0) return;
    if (seen.has(token)) return;
    seen.add(token);
    result.push(token);
  };

  // 1. Backticked spans (author-marked, highest signal). A span may itself contain a
  //    path/identifier; keep the inner content verbatim as one candidate.
  for (const m of trimmed.matchAll(BACKTICKED_RE)) {
    const inner = m[1];
    if (inner !== undefined) add(inner);
  }
  // 2. Paths (contain a slash).
  for (const m of trimmed.matchAll(PATH_RE)) add(m[0]);
  // 3. CamelCase / PascalCase.
  for (const m of trimmed.matchAll(CAMEL_RE)) add(m[0]);
  // 4. Dotted/scoped identifiers.
  for (const m of trimmed.matchAll(DOTTED_RE)) add(m[0]);

  return result;
}
