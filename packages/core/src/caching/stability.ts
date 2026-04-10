import type { StabilityTier } from '@harness-engineering/types';
import { NODE_STABILITY } from '@harness-engineering/graph';

/**
 * Normalized lookup table mapping both PascalCase graph node display names
 * and lowercase NodeType enum values to their stability tiers.
 */
const STABILITY_LOOKUP: Record<string, StabilityTier> = {};

// Populate from NODE_STABILITY (PascalCase keys like 'File', 'SkillDefinition')
for (const [key, tier] of Object.entries(NODE_STABILITY)) {
  STABILITY_LOOKUP[key] = tier;
  // Also add lowercase version for NodeType enum values (e.g., 'file', 'function')
  STABILITY_LOOKUP[key.toLowerCase()] = tier;
}

// Map graph NodeType enum values that differ from PascalCase lowering
// e.g., 'packed_summary' (NodeType) vs 'packedsummary' (from PascalCase.toLowerCase())
STABILITY_LOOKUP['packed_summary'] = 'session';
// 'skill' NodeType maps to SkillDefinition
STABILITY_LOOKUP['skill'] = 'static';

/**
 * Resolve the stability tier for a content type or graph node type.
 *
 * Accepts both PascalCase display names (e.g., 'SkillDefinition') and
 * lowercase NodeType enum values (e.g., 'file', 'packed_summary').
 *
 * Returns 'ephemeral' for any unrecognized type.
 */
export function resolveStability(contentType: string): StabilityTier {
  return STABILITY_LOOKUP[contentType] ?? 'ephemeral';
}
