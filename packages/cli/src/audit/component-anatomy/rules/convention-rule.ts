/**
 * Convention rule types — drive `ANAT-D*` (definition) findings.
 *
 * A `ConventionRule` describes the expected anatomy of a `componentType`
 * sourced from authoritative external specs (APG / Open UI / Radix /
 * internal design-component-anatomy knowledge). The rule runner compares
 * the rule's required parts against the parsed component definition and
 * emits findings for missing parts.
 *
 * Per Phase 0 schema-fit review (review.md):
 *  - `AnatomyPart.exclusive` carries TWO scopes — per-instance (Button's
 *    disabled/loading) and per-sibling-set (Tabs's selected). The runner
 *    interprets which scope applies based on the part's location
 *    (`states[]` vs. compound child). The schema does not encode that
 *    distinction explicitly.
 *  - Compound child-pairing constraints (e.g. Tabs trigger/panel id
 *    matching) are NOT encoded in this schema — they are runner-side
 *    structural checks performed out-of-band when needed.
 *
 * Source: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Technical Design → Data structures → ConventionRule).
 */

/** One anatomy axis entry (slot, state, variant, or size). */
export interface AnatomyPart {
  /** Canonical part name (e.g. `content`, `loading`, `primary`, `sm`). */
  name: string;
  /** When true, omission emits a Tier-1 `ANAT-D*` finding. */
  required: boolean;
  /**
   * Marks mutual exclusion. Two scopes (Phase 0 review.md §Tabs):
   *  - per-instance — the part cannot combine with other exclusive parts
   *    on the same render (Button: disabled XOR loading).
   *  - per-sibling-set — exactly one in the sibling group carries the
   *    part at a given time (Tabs: exactly one trigger is `selected`).
   * Scope is inferred from the host component's compound shape.
   */
  exclusive?: boolean;
  /** Human-readable fix guidance written verbatim into `finding.fix.description`. */
  fixHint: string;
}

/**
 * Source citation. The `ref` field uses one of the published prefixes
 * documented in `finding-codes.md` (`APG/`, `OpenUI/`, `Radix/`,
 * `design-component-anatomy/`). New prefixes require updating both the
 * reference doc AND the schema validator.
 */
export interface ConventionSource {
  ref: string;
  url?: string;
}

/**
 * Full convention rule for one component type.
 *
 * The four orthogonal axes (slots / states / variants / sizes) cleanly
 * partition the surface — there is no expected overlap or ambiguity
 * (validated by Phase 0 schema-fit review).
 */
export interface ConventionRule {
  /** Component type identifier matched by the type resolver (e.g. `Button`). */
  componentType: string;
  slots: AnatomyPart[];
  states: AnatomyPart[];
  variants: AnatomyPart[];
  sizes: AnatomyPart[];
  source: ConventionSource;
}
