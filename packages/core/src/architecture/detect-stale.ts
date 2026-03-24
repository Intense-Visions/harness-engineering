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
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  let constraints = store.findNodes({ type: 'constraint' });

  if (category) {
    constraints = constraints.filter((n) => n.category === category);
  }

  const totalConstraints = constraints.length;
  const staleConstraints: StaleConstraint[] = [];

  for (const node of constraints) {
    const lastViolatedAt = (node.lastViolatedAt as string | null) ?? null;
    const createdAt = node.createdAt as string;
    const comparisonTimestamp = lastViolatedAt ?? createdAt;

    if (!comparisonTimestamp) continue;

    const timestampMs = new Date(comparisonTimestamp).getTime();
    if (timestampMs < cutoff) {
      const daysSince = Math.floor((now - timestampMs) / (24 * 60 * 60 * 1000));
      staleConstraints.push({
        id: node.id as string,
        category: node.category as ArchMetricCategory,
        description: (node.name as string) ?? '',
        scope: (node.scope as string) ?? 'project',
        lastViolatedAt,
        daysSinceLastViolation: daysSince,
      });
    }
  }

  // Sort by most stale first
  staleConstraints.sort((a, b) => b.daysSinceLastViolation - a.daysSinceLastViolation);

  return { staleConstraints, totalConstraints, windowDays };
}
