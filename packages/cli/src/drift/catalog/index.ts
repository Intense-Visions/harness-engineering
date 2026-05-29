/**
 * Drift finding-code catalog registry — single source of truth for the
 * built-in `DRIFT-*` codes shipped with detect-design-drift.
 *
 * Why a registry instead of an inline `Record` in `findings/finding.ts`:
 *  - Cross-skill consumers (e.g. future `harness check-design --fix`
 *    composition, `align-design-system` introspection) need the code
 *    set without coupling to internal severity machinery.
 *  - Adding a new rule code (DRIFT-T005, DRIFT-V*, etc.) becomes a
 *    single-entry change here rather than touching the inline table +
 *    the rule emitter at the same time.
 *  - Mirrors the pattern proven for `audit-component-anatomy/catalog/`
 *    — keeping floor-raising sub-projects shape-consistent so the
 *    (future) #5 orchestrator can iterate uniformly.
 *
 * The registry's shape (immutable list of `DriftCodeEntry` records) is
 * the durable contract. Consumers reach for the public helpers
 * (`getDriftCodes`, `lookupDriftCode`, `listDriftCodes`) rather than
 * importing this module directly — `../exports.ts` is the stable
 * surface.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Technical Design → Code namespace).
 */

import type { DriftFindingCode, DriftSeverity } from '../findings/finding.js';

/**
 * One catalog entry per built-in DRIFT-* code. The `category` field
 * mirrors the `rule.category` discriminant on `DriftFinding` so a
 * downstream consumer can join the catalog against emitted findings
 * without re-deriving the category from the code prefix.
 */
export interface DriftCodeEntry {
  readonly code: DriftFindingCode;
  readonly category: 'token-bypass' | 'primitive-adoption';
  /** Severity emitted under `design.strictness = "standard"`. */
  readonly standardSeverity: DriftSeverity;
  /** One-line human-readable description for surfacing in catalogs / docs. */
  readonly description: string;
}

const ENTRIES: readonly DriftCodeEntry[] = Object.freeze([
  {
    code: 'DRIFT-T001',
    category: 'token-bypass',
    standardSeverity: 'error',
    description: 'Hex color literal outside the declared palette.',
  },
  {
    code: 'DRIFT-T002',
    category: 'token-bypass',
    standardSeverity: 'error',
    description: 'Font-family outside the declared typography palette.',
  },
  {
    code: 'DRIFT-T003',
    category: 'token-bypass',
    standardSeverity: 'warn',
    description: 'Pixel value outside the declared spacing scale.',
  },
  {
    code: 'DRIFT-T004',
    category: 'token-bypass',
    standardSeverity: 'warn',
    description: 'Reference to a token marked deprecated in tokens.json.',
  },
  {
    code: 'DRIFT-P001',
    category: 'primitive-adoption',
    standardSeverity: 'error',
    description: 'Raw <button> where a Button component is registered.',
  },
  {
    code: 'DRIFT-P002',
    category: 'primitive-adoption',
    standardSeverity: 'warn',
    description: 'Raw <input> where an Input component is registered.',
  },
  {
    code: 'DRIFT-P003',
    category: 'primitive-adoption',
    standardSeverity: 'warn',
    description: 'Raw <a href> where a Link/Anchor component is registered.',
  },
  {
    code: 'DRIFT-P004',
    category: 'primitive-adoption',
    standardSeverity: 'warn',
    description: 'Raw <textarea> where a Textarea component is registered.',
  },
] satisfies readonly DriftCodeEntry[]);

const byCode = new Map<string, DriftCodeEntry>(ENTRIES.map((e) => [e.code, e]));

/**
 * Public list of DRIFT-* finding codes shipped with v1. Returns a
 * freshly-allocated sorted array so callers cannot mutate the
 * registry through the returned reference.
 *
 * Cross-skill consumers (orchestrator composition, align-design-system
 * introspection) read the code set via this helper rather than
 * importing the entries directly.
 */
export function getDriftCodes(): DriftFindingCode[] {
  return ENTRIES.map((e) => e.code).sort() as DriftFindingCode[];
}

/**
 * Lookup a catalog entry by code. Returns `null` for unknown codes
 * (forward-compatibility — a consumer holding an older catalog must
 * tolerate codes from a newer detector).
 */
export function lookupDriftCode(code: string): DriftCodeEntry | null {
  return byCode.get(code) ?? null;
}

/**
 * Iterate the full catalog. Consumers receive a copy so they can
 * filter / sort without affecting the registry.
 */
export function listDriftCodes(): DriftCodeEntry[] {
  return [...ENTRIES];
}
