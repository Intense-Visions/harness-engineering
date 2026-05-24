/**
 * Pattern rule types — drive `ANAT-P*` (pattern-presence) findings.
 *
 * A `PatternRule` declares a structural query (tree-sitter S-expression)
 * plus optional postprocessing logic that decides whether each match
 * actually emits a finding. The blue-ocean differentiator: no published
 * lint tool produces this finding class (REFERENCES.md gap #4).
 *
 * Schema includes the Phase 0 review.md recommended additive fields:
 *  - `postProcess?` — rule-owned predicate that filters matches by
 *    walking ancestors for guard expressions (ANAT-P001 map-without-empty
 *    needs this to detect `items.length === 0 ? ... : items.map()` guards).
 *  - `auxiliary?` — rule-tuneable data (ANAT-P004 carries the
 *    `knownFallbackComponents` list this way).
 *
 * Source: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Technical Design → Data structures → PatternRule) and Phase 0
 * schema-fit review §ANAT-P001 / §ANAT-P004.
 */

import type { AnatomyFindingCode, Severity } from '../findings/finding.js';
import type { ConventionSource } from './convention-rule.js';

/**
 * One tree-sitter query match. Field set is intentionally minimal in v1 —
 * concrete capture data is added when the tree-sitter wrapper lands. The
 * type is exported so rule authors can write strongly-typed `postProcess`
 * predicates today.
 */
export interface TreeSitterCapture {
  /** Path of the file the match was found in (project-relative). */
  file: string;
  /** 1-indexed line of the primary capture node. */
  line: number;
  /** 1-indexed column. */
  column?: number;
  /**
   * Named captures from the query (`@map-call`, `@rendered`, etc.).
   * Values are opaque to the rule type — the runner populates them when
   * tree-sitter is wired up. Rules treat unknown keys as undefined.
   */
  captures?: Record<string, unknown>;
}

/**
 * Pattern rule definition. The two additive fields (`postProcess`,
 * `auxiliary`) were recommended by Phase 0 schema-fit review to keep
 * rule logic and rule-tuneable data co-located with the rule itself
 * rather than scattered as runner-side constants.
 */
export interface PatternRule {
  /** Finding code emitted on a match (e.g. `ANAT-P001`). */
  code: AnatomyFindingCode;
  /** Tree-sitter S-expression query (tree-sitter-tsx or -typescript). */
  treeSitterQuery: string;
  /** Default severity before `design.strictness` promotion. */
  severityDefault: Severity;
  /** Human-readable message builder. */
  message: (capture: TreeSitterCapture) => string;
  /** Verbatim guidance text written into `finding.fix.description`. */
  fixHint: string;
  /** Source citation (same prefix vocabulary as `ConventionRule`). */
  source: ConventionSource;
  /**
   * Optional postprocessing predicate. Receives all matches and the
   * source file, returns the subset that should emit findings. Use this
   * to walk ancestors for guard expressions or to suppress matches whose
   * rendered children are themselves fallback affordances.
   *
   * When omitted, every match emits a finding.
   *
   * Added per Phase 0 review.md §ANAT-P001 recommendation.
   */
  postProcess?: (
    matches: TreeSitterCapture[],
    file: { path: string; contents: string }
  ) => TreeSitterCapture[];
  /**
   * Optional rule-tuneable data. Use a typed shape inside the rule
   * (e.g. `{ knownFallbackComponents: string[] }`) — `unknown` here
   * keeps the schema open so rules can carry whatever bag of data they
   * need without expanding the core type.
   *
   * Added per Phase 0 review.md §ANAT-P004 recommendation.
   */
  auxiliary?: Record<string, unknown>;
}
