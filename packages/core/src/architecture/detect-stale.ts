import type { ArchMetricCategory } from './types';
import type { ConstraintNodeStore } from './sync-constraints';

export interface StaleConstraint {
  id: string;
  category: ArchMetricCategory;
  description: string;
  scope: string;
  lastViolatedAt: string | null;
  daysSinceLastViolation: number;
}

export interface DetectStaleResult {
  staleConstraints: StaleConstraint[];
  totalConstraints: number;
  windowDays: number;
}

type ConstraintNode = { id: string; [key: string]: unknown };

/**
 * Evaluate a single constraint node against the staleness cutoff.
 * Returns a StaleConstraint entry if stale, or null if not.
 */
function evaluateStaleNode(
  node: ConstraintNode,
  now: number,
  cutoff: number
): StaleConstraint | null {
  const lastViolatedAt = (node.lastViolatedAt as string | null) ?? null;
  const createdAt = node.createdAt as string;
  const comparisonTimestamp = lastViolatedAt ?? createdAt;

  if (!comparisonTimestamp) return null;

  const timestampMs = new Date(comparisonTimestamp).getTime();
  if (timestampMs >= cutoff) return null;

  const daysSince = Math.floor((now - timestampMs) / (24 * 60 * 60 * 1000));
  return {
    id: node.id,
    category: node.category as ArchMetricCategory,
    description: (node.name as string) ?? '',
    scope: (node.scope as string) ?? 'project',
    lastViolatedAt,
    daysSinceLastViolation: daysSince,
  };
}

/**
 * Detect constraint rules that haven't been violated within the given window.
 *
 * A constraint is considered stale if its comparison timestamp
 * (lastViolatedAt ?? createdAt) is older than `now - windowDays`.
 */
export function detectStaleConstraints(
  store: ConstraintNodeStore,
  windowDays: number = 30,
  category?: ArchMetricCategory
): DetectStaleResult {
  const now = Date.now();
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;

  let constraints = store.findNodes({ type: 'constraint' });

  if (category) {
    constraints = constraints.filter((n) => n.category === category);
  }

  const totalConstraints = constraints.length;
  const staleConstraints: StaleConstraint[] = [];

  for (const node of constraints) {
    const entry = evaluateStaleNode(node, now, cutoff);
    if (entry) staleConstraints.push(entry);
  }

  staleConstraints.sort((a, b) => b.daysSinceLastViolation - a.daysSinceLastViolation);

  return { staleConstraints, totalConstraints, windowDays };
}
