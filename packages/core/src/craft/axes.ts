// packages/core/src/craft/axes.ts
//
// The canonical 3-axis craft vocabulary (ADR 0019), relocated here from
// `packages/cli/src/shared/craft/findings/axes.ts`.
//
// WHY it moved: `core/src/fleet/clumping`'s floor reads these axes, and core
// cannot import from cli (see the `core` layer in harness.config.json —
// allowedDependencies: types, graph). Core therefore defines the vocabulary and
// cli derives from it; no cycle is introduced
// (docs/changes/clumping/proposal.md, "One layering change").
//
// What deliberately did NOT move: `derivePriority`
// (packages/cli/src/shared/craft/findings/derived.ts) and `CONFIDENCE_RANK`.
// ADR 0019 keeps the raw axes authoritative and the derivation sort-only; moving
// the derivation would be scope creep the spec names as a non-goal.
//
// Exported from the package root as `CraftTier`, `Impact`, `Confidence` — NOT as
// `Tier`. `core/src/harness-strength/types.ts` already exports a DIFFERENT `Tier`
// through the same barrel, and two `export *` sources for one name is a hard
// TS2308 error. The alias is applied at the barrel; cli's shim renames it back so
// craft consumers keep seeing `Tier`.

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
