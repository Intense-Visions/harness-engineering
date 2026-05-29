/**
 * Align catalog registry — declares which DRIFT-* codes the
 * align-design-system v1 skill knows how to handle and whether each
 * code participates as an automatic codemod or a precise suggestion
 * only.
 *
 * Per the spec's decision table (Pre-flight classifier rules v1):
 *   - DRIFT-T001/T002/T003 → codemod when the pre-flight classifier
 *     judges the file context safe; else downgraded to suggestion.
 *   - DRIFT-T004 → suggestion always (v1 never auto-applies deprecated
 *     migration; target may not be in `$description`).
 *   - DRIFT-P*  → suggestion always (v1 never auto-applies primitive
 *     adoption; prop translation is genuinely ambiguous).
 *
 * Why a registry instead of inline branches in `index.ts#processFinding`:
 *  - Cross-skill consumers (the future #5 orchestrator, integration
 *    tests for the pipeline-handoff contract) need to introspect which
 *    codes align CAN attempt to fix vs. which it will always punt to a
 *    human, without running the skill.
 *  - Adding a v1.x rule (e.g. DRIFT-P* codemods once prop-translation
 *    tables ship) becomes a registry entry change rather than a logic
 *    edit at multiple sites.
 *  - Mirrors `packages/cli/src/drift/catalog/index.ts` and
 *    `packages/cli/src/audit/component-anatomy/catalog/index.ts` —
 *    the floor-raising sub-projects share this convention.
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Technical Design → Pre-flight classifier rules v1; Scope → In-scope).
 */

import type { DriftFindingCode } from '../../drift/findings/finding.js';

/**
 * What align-design-system v1 will do with a finding of this code
 * BEFORE the per-file pre-flight classifier runs.
 *
 * `codemod-or-suggestion` — the codemod is registered; the classifier
 *   decides at call time whether the codemod can run safely or must
 *   downgrade to a suggestion (the T001/T002/T003 path).
 *
 * `suggestion-only` — no codemod is registered in v1; the skill always
 *   emits a precise suggestion (the T004 + P* path).
 */
export type AlignHandlingMode = 'codemod-or-suggestion' | 'suggestion-only';

export interface AlignCodeEntry {
  readonly code: DriftFindingCode;
  readonly handling: AlignHandlingMode;
  /** One-line human description of the v1 handling decision. */
  readonly description: string;
}

const ENTRIES: readonly AlignCodeEntry[] = Object.freeze([
  {
    code: 'DRIFT-T001',
    handling: 'codemod-or-suggestion',
    description: 'Hex literal → token reference codemod (when import + context safe).',
  },
  {
    code: 'DRIFT-T002',
    handling: 'codemod-or-suggestion',
    description: 'Font-family string → typography token codemod (when import + context safe).',
  },
  {
    code: 'DRIFT-T003',
    handling: 'codemod-or-suggestion',
    description: 'Px value → spacing token codemod (when exact-match + context safe).',
  },
  {
    code: 'DRIFT-T004',
    handling: 'suggestion-only',
    description: 'Deprecated token — emit migration suggestion only (v1 never auto-applies).',
  },
  {
    code: 'DRIFT-P001',
    handling: 'suggestion-only',
    description: 'Raw <button> → Button primitive adoption — suggestion only (prop translation).',
  },
  {
    code: 'DRIFT-P002',
    handling: 'suggestion-only',
    description: 'Raw <input> → Input primitive adoption — suggestion only (prop translation).',
  },
  {
    code: 'DRIFT-P003',
    handling: 'suggestion-only',
    description: 'Raw <a> → Link/Anchor primitive adoption — suggestion only (prop translation).',
  },
  {
    code: 'DRIFT-P004',
    handling: 'suggestion-only',
    description: 'Raw <textarea> → Textarea primitive adoption — suggestion only.',
  },
] satisfies readonly AlignCodeEntry[]);

const byCode = new Map<string, AlignCodeEntry>(ENTRIES.map((e) => [e.code, e]));

/**
 * Public list of DRIFT-* codes align-design-system v1 knows about,
 * sorted alphabetically. Returns a freshly-allocated array so callers
 * cannot mutate the registry through the returned reference.
 */
export function getAlignCodes(): DriftFindingCode[] {
  return ENTRIES.map((e) => e.code).sort() as DriftFindingCode[];
}

/**
 * Lookup the align entry for a code. Returns `null` for codes the v1
 * align catalog does not declare (e.g. DRIFT-V* variant proliferation,
 * deferred to v1.x).
 */
export function lookupAlignCode(code: string): AlignCodeEntry | null {
  return byCode.get(code) ?? null;
}

/**
 * Iterate the full catalog. Consumers receive a copy so they can
 * filter / sort without affecting the registry.
 */
export function listAlignCodes(): AlignCodeEntry[] {
  return [...ENTRIES];
}

/**
 * Convenience — list only codes that v1 may auto-apply (codemod path).
 * Used by orchestrator-side filtering: "give me the findings worth
 * running align on for an auto-fix batch."
 */
export function getCodemodCapableCodes(): DriftFindingCode[] {
  return ENTRIES.filter((e) => e.handling === 'codemod-or-suggestion')
    .map((e) => e.code)
    .sort() as DriftFindingCode[];
}
