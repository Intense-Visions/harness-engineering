/**
 * Shared 3-axis primitives for the craft skill family (ADR 0019).
 *
 * Extracted from packages/cli/src/design-craft/findings/schema.ts on the
 * 2nd-non-design-craft-consumer trigger (spec-craft). naming-craft was
 * the first non-design consumer and imported from design-craft directly;
 * with spec-craft landing, we move to a shared home so future craft
 * skills (test-craft, code-craft, copy-craft, etc.) all import from one
 * canonical location.
 *
 * design-craft's per-skill CraftFinding type — which has design-specific
 * fields (component, page) — stays in design-craft. Only the primitive
 * axes move to shared.
 */

/**
 * The "tier" axis of the 3-axis craft model (ADR 0019).
 *
 * - `foundational`: prerequisite craft — without it the artifact fails its
 *   basic job (design: hierarchy unreadable; spec: load-bearing decision
 *   missing; naming: silent unit).
 * - `polish`: above-floor craft that makes a competent artifact feel
 *   considered.
 * - `aspirational`: ceiling-raising craft that distinguishes excellent work
 *   from merely good.
 */
export type Tier = 'foundational' | 'polish' | 'aspirational';

/**
 * The "impact" axis of the 3-axis craft model (ADR 0019).
 *
 * How much the finding moves the perceived quality of the target if
 * addressed. NOT a frequency or severity measure.
 */
export type Impact = 'small' | 'medium' | 'large';

/**
 * The "confidence" axis of the 3-axis craft model (ADR 0019).
 *
 * Honesty about the LLM's certainty in the judgment. Essential for LLM-
 * judgment outputs: a low-confidence finding should be visually distinct
 * in downstream reporting and may be filtered at higher autoCapture
 * strictnesses.
 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Numeric ranking of the confidence axis (higher = more confident).
 * Canonical so every craft consumer orders confidence identically — e.g.
 * min-confidence aggregation (design-craft benchmark) and the award-bar
 * confidence gate. Import this rather than re-declaring the map.
 */
export const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};
