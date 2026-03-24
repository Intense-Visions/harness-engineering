import type { ConstraintRule, MetricResult } from './types';

/**
 * Minimal graph store interface for constraint node operations.
 * Matches the subset of GraphStore used by this module.
 */
export interface ConstraintNodeStore {
  findNodes(query: { type: string }): Array<{
    id: string;
    [key: string]: unknown;
  }>;
  upsertNode(node: Record<string, unknown>): void;
  removeNode(id: string): void;
}

/**
 * Synchronize constraint rules with graph nodes.
 *
 * - Upserts each rule as a `constraint` node (sets `createdAt` on first insert)
 * - Matches violations to rules and updates `lastViolatedAt`
 * - Prunes constraint nodes not present in the current rules set (orphan cleanup)
 */
export function syncConstraintNodes(
  store: ConstraintNodeStore,
  rules: ConstraintRule[],
  violations: MetricResult[]
): void {
  const now = new Date().toISOString();
  const ruleIds = new Set(rules.map((r) => r.id));

  // Collect all violation file paths grouped by category
  const violationsByCategory = new Map<string, string[]>();
  for (const result of violations) {
    const files = result.violations.map((v) => v.file);
    const existing = violationsByCategory.get(result.category) ?? [];
    violationsByCategory.set(result.category, [...existing, ...files]);
  }

  // Index existing constraint nodes by ID for O(1) lookup
  const existingNodesById = new Map<string, { id: string; [key: string]: unknown }>();
  for (const node of store.findNodes({ type: 'constraint' })) {
    existingNodesById.set(node.id, node);
  }

  // Upsert each rule as a constraint node
  for (const rule of rules) {
    const existing = existingNodesById.get(rule.id);
    const createdAt = (existing?.createdAt as string) ?? now;
    const previousLastViolatedAt = (existing?.lastViolatedAt as string | null) ?? null;

    // A rule is considered violated if its category has any violations
    // and at least one violation file falls within the rule's scope
    const hasViolation = hasMatchingViolation(rule, violationsByCategory);
    const lastViolatedAt = hasViolation ? now : previousLastViolatedAt;

    store.upsertNode({
      id: rule.id,
      type: 'constraint',
      name: rule.description,
      category: rule.category,
      scope: rule.scope,
      createdAt,
      lastViolatedAt,
    });
  }

  // Prune orphaned constraint nodes not in the current rule set
  const existingConstraints = store.findNodes({ type: 'constraint' });
  for (const node of existingConstraints) {
    if (!ruleIds.has(node.id)) {
      store.removeNode(node.id);
    }
  }
}

/**
 * Check if a rule has matching violations based on category and scope containment.
 */
function hasMatchingViolation(
  rule: ConstraintRule,
  violationsByCategory: Map<string, string[]>
): boolean {
  const files = violationsByCategory.get(rule.category);
  if (!files || files.length === 0) return false;

  // Project-scoped rules match any violation in their category
  if (rule.scope === 'project') return true;

  // Scoped rules match violations whose file path starts with the rule's scope
  return files.some((file) => file.startsWith(rule.scope));
}
