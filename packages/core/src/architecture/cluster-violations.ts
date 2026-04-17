import type { ArchMetricCategory, Violation, ViolationSnapshot } from './types';
import { normalizeViolationPattern, extractDirectoryScope } from './normalize-pattern';

export interface ViolationCluster {
  category: ArchMetricCategory;
  pattern: string;
  scope: string;
  violations: Array<{ violation: Violation; timestamp: string }>;
  uniqueFiles: Set<string>;
}

/**
 * Cluster violations from history snapshots by (category, normalized pattern, directory scope).
 * Only includes violations within the specified time window.
 */
export function clusterViolations(
  snapshots: ViolationSnapshot[],
  windowWeeks: number
): ViolationCluster[] {
  const cutoff = Date.now() - windowWeeks * 7 * 24 * 60 * 60 * 1000;
  const clusters = new Map<string, ViolationCluster>();

  for (const snapshot of snapshots) {
    if (new Date(snapshot.timestamp).getTime() < cutoff) continue;

    for (const violation of snapshot.violations) {
      const category = violation.category ?? 'unknown';
      const pattern = normalizeViolationPattern(violation);
      const scope = extractDirectoryScope(violation.file);
      const key = `${category}::${pattern}::${scope}`;

      let cluster = clusters.get(key);
      if (!cluster) {
        cluster = {
          category: category as ArchMetricCategory,
          pattern,
          scope,
          violations: [],
          uniqueFiles: new Set(),
        };
        clusters.set(key, cluster);
      }

      cluster.violations.push({ violation, timestamp: snapshot.timestamp });
      cluster.uniqueFiles.add(violation.file);
    }
  }

  return [...clusters.values()];
}
