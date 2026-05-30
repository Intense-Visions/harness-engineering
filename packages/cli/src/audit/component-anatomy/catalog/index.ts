/**
 * Convention catalog registry — single source of truth for the
 * built-in `ConventionRule`s shipped with the audit.
 *
 * Phase 2 catalog expansion adds 19 more conventions; each new file in
 * `./conventions/` registers itself here via a one-line entry. The
 * registry's shape (a `Map` keyed by `componentType`) is the durable
 * contract — consumers reach for it via the public helpers below
 * (`getCatalogTypes`, `lookupConvention`, `listConventions`) rather
 * than importing individual rule modules.
 *
 * Why a registry instead of inline maps in each resolver:
 *  - harness-accessibility's Phase 1 step 2.6 deferral needs the type
 *    set without taking on a heavy dependency. The `getCatalogTypes()`
 *    public export re-exported from `../exports.ts` is the contract
 *    referenced by the a11y SKILL.md.
 *  - Component-type resolver (Decision #3 export-name layer) and
 *    source-of-truth resolver (Decision #1 conventions layer) both
 *    need the same data — sharing one registry avoids drift between
 *    them.
 *  - Catalog expansion (Phase 2) becomes a single-file change per
 *    component instead of touching two resolvers + one MCP tool.
 *
 * Source: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Technical Design → "Catalog data" + Integration Points → Skill module
 *  export `getCatalogTypes(): string[]`).
 */

import type { ConventionRule } from '../rules/convention-rule.js';
import { buttonConvention } from './conventions/button.js';
import { dialogConvention } from './conventions/dialog.js';
import { emptyStateConvention } from './conventions/empty-state.js';
import { inputConvention } from './conventions/input.js';
import { selectConvention } from './conventions/select.js';
import { switchConvention } from './conventions/switch.js';

/**
 * Built-in convention catalog. Phase 1 shipped Button; Phase 2 catalog
 * expansion grows this to the 20-component v1 set documented in
 * proposal.md § Success Criteria #7. New entries land as one-line
 * additions to this array.
 *
 * Entries are immutable at the module boundary — consumers receive
 * copies via `listConventions()` and the keys via `getCatalogTypes()`.
 */
const builtinConventions: ConventionRule[] = [
  buttonConvention,
  dialogConvention,
  emptyStateConvention,
  inputConvention,
  selectConvention,
  switchConvention,
];

const conventionByType = new Map<string, ConventionRule>(
  builtinConventions.map((rule) => [rule.componentType, rule])
);

/**
 * Public list of component types in the built-in catalog.
 *
 * This is the named export `harness-accessibility` Phase 1 step 2.6
 * imports to decide which JSX elements to defer A11Y-010 / A11Y-050
 * findings for. The signature (`string[]`) is the stable contract;
 * the contents may grow across versions.
 *
 * Returns a freshly-allocated array so callers cannot mutate the
 * registry through the returned reference.
 */
export function getCatalogTypes(): string[] {
  return [...conventionByType.keys()].sort();
}

/**
 * Lookup a convention by component type. Returns `null` when the
 * type is not in the catalog — callers MUST handle the silent-skip
 * case per Decision #1 (the audit does not fabricate rules).
 */
export function lookupConvention(componentType: string): ConventionRule | null {
  return conventionByType.get(componentType) ?? null;
}

/**
 * Iterate the full catalog. Consumers receive a copy so they can
 * filter / sort without affecting the registry.
 */
export function listConventions(): ConventionRule[] {
  return [...builtinConventions];
}
