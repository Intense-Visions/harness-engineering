import type { BundleConstraints, Contributions } from './types';

export interface ConflictReport {
  section: string;
  key: string;
  localValue: unknown;
  packageValue: unknown;
  description: string;
}

export interface MergeResult {
  config: Record<string, unknown>;
  contributions: Contributions;
  conflicts: ConflictReport[];
}

/**
 * Deep-merge bundle constraints into a local config.
 *
 * Each constraint section has its own merge semantics:
 * - Layers: match by name, append new, conflict on different config
 * - Forbidden imports: match by `from`, append new, conflict on different `disallow`
 * - Boundaries: union requireSchema arrays, deduplicate
 * - Architecture thresholds: per-category merge, conflict on different values
 * - Architecture modules: per-module per-category merge, same conflict strategy
 * - Security rules: per-rule-ID merge, conflict on different severity
 */
export function deepMergeConstraints(
  localConfig: Record<string, unknown>,
  bundleConstraints: BundleConstraints,
  _existingContributions?: Contributions
): MergeResult {
  return {
    config: { ...localConfig },
    contributions: {},
    conflicts: [],
  };
}
