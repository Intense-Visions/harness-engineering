/**
 * Shared 3-axis primitives for the craft skill family (ADR 0019).
 *
 * The three axis TYPES now live in `packages/core/src/craft/axes.ts`. Core cannot
 * import from cli, and `core/src/fleet/clumping`'s floor reads the axes
 * (docs/changes/clumping/proposal.md, "One layering change"), so core defines the
 * vocabulary and cli derives from it.
 *
 * This module stays the canonical IMPORT PATH for every craft consumer: its export
 * surface is unchanged, so no consumer edit is required. Do not "clean this up" by
 * pointing consumers at core directly — the indirection is what made the relocation
 * a zero-diff change for 17 files.
 *
 * `Tier` arrives from core as `CraftTier`: core's barrel already exports a DIFFERENT
 * `Tier` from `harness-strength`, and two `export *` sources for one name is a hard
 * TS2308 error. The alias is undone here, so craft consumers still see `Tier`.
 *
 * `CONFIDENCE_RANK` and `derivePriority` (./derived.ts) deliberately stayed in cli:
 * ADR 0019 keeps the raw axes authoritative and the derivation sort-only.
 */
import type { CraftTier, Impact, Confidence } from '@harness-engineering/core';

export type { CraftTier as Tier, Impact, Confidence };

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
