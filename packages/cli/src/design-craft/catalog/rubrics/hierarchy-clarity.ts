// packages/cli/src/design-craft/catalog/rubrics/hierarchy-clarity.ts
//
// First Phase 1 catalog rubric — ported from the Phase 0 paper spike:
//   docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/
//   rubrics/hierarchy-clarity.md
//
// Establishes the TypeScript `RubricDefinition` shape that the rest of the
// 10-rubric seed catalog will conform to. Schema mirrors the YAML form in
// the spec section "Catalog entry formats" (lines ~223–253) with adjustments
// per Phase 0 review observations:
//   - O1: source.url is OPTIONAL (some rubrics synthesize from many sources)
//   - O3: contributors[] is the canonical author surface (no addedBy alias)
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { Tier, Impact, FindingPhase } from '../../findings/schema.js';

/** Lifecycle state of a catalog entry. */
export type CatalogStatus = 'stable' | 'draft' | 'deprecated';

/** Targets the rubric is intended to evaluate. */
export type RubricScope = 'component' | 'page';

/** Source provenance for a catalog entry. */
export interface CatalogSource {
  /** Short ref tag (e.g. `huashu-design#hierarchy`). Required. */
  ref: string;
  /** Optional URL. Some rubrics synthesize from many sources (Phase 0 O1). */
  url?: string;
}

/**
 * Per-rubric template for the CraftFinding the LLM is asked to produce.
 *
 * The LLM still emits its own message + tier × impact × confidence judgment
 * for each application of the rubric, but the template fixes the `code` and
 * provides default tier + impact hints (the LLM may override impact based
 * on the specific target; tier is generally rubric-stable).
 */
export interface FindingTemplate {
  /** Stable code in the CRAFT-(C|P)\d{3} namespace. */
  code: string;
  /** Default tier for findings produced from this rubric (LLM may override). */
  tier: Tier;
  /** Default impact (LLM may override based on target severity). */
  impact: Impact;
  /** Which phase emits findings from this rubric. */
  phase: FindingPhase;
}

/**
 * A rubric definition — the LLM-judgment prompt + provenance + finding-shape
 * envelope for one critique dimension.
 */
export interface RubricDefinition {
  id: string;
  name: string;
  version: number;
  status: CatalogStatus;
  authoredAt: string;
  contributors: string[];
  appliesTo: RubricScope[];
  source: CatalogSource;
  /**
   * The prompt template handed to the text-LLM. `{target}` placeholder is
   * replaced with the target component identifier; `{source}` placeholder is
   * replaced with the component's source code at call time (see
   * phases/critique.ts).
   */
  prompt: string;
  positiveExample: string;
  negativeExample: string;
  findingTemplate: FindingTemplate;
}

/**
 * Rubric: Hierarchy Clarity.
 *
 * Ported verbatim (content) from the Phase 0 paper rubric. CRAFT-C001 is
 * the first critique code in the design-craft namespace.
 */
export const hierarchyClarityRubric: RubricDefinition = {
  id: 'rubric-hierarchy-clarity',
  name: 'Hierarchy Clarity',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-23',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'huashu-design#hierarchy',
    url: 'https://github.com/alchaincyf/huashu-design',
  },
  prompt: [
    'Evaluate the visual hierarchy of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Is there a clear primary, secondary, tertiary level?',
    '- Does typographic scale support the hierarchy or muddy it?',
    '- Are spacing, color, and weight all aligned with hierarchy intent?',
    '- Identify any "competing for primary" elements (e.g., two buttons',
    '  with equal weight, two headings with equal size, color/weight',
    '  pulling against scale).',
    '- Where does the eye land first? Is that the intended entry point?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Be honest',
    'about confidence — if the target is ambiguous, say so.',
    '',
    'Respond with a single fenced ```json``` block containing an object:',
    '{',
    '  "tier": "foundational" | "polish" | "aspirational",',
    '  "impact": "small" | "medium" | "large",',
    '  "confidence": "high" | "medium" | "low",',
    '  "message": "<one-paragraph critique of what you see>"',
    '}',
  ].join('\n'),
  positiveExample: [
    'Linear command palette — primary action reads with weight + saturation',
    '+ spacing; secondary items reduced weight; tertiary metadata gets a',
    'dedicated visual register (monospace, dim). Eye lands on the search',
    'field, then drops cleanly down the result list.',
  ].join('\n'),
  negativeExample: [
    'Three CTAs in a row, all with identical weight, color, and size. No',
    'primary signal — user must read every label to decide. Same failure',
    'mode in card layouts where every card claims equal visual loudness.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C001',
    tier: 'foundational',
    impact: 'large',
    phase: 'critique',
  },
};
