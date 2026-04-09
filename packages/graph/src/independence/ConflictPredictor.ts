import type { GraphStore } from '../store/GraphStore.js';
import type {
  IndependenceCheckParams,
  OverlapDetail,
  PairResult,
} from './TaskIndependenceAnalyzer.js';
import { TaskIndependenceAnalyzer } from './TaskIndependenceAnalyzer.js';
import { GraphComplexityAdapter } from '../entropy/GraphComplexityAdapter.js';
import { GraphCouplingAdapter } from '../entropy/GraphCouplingAdapter.js';

// --- Public types ---

export type ConflictSeverity = 'high' | 'medium' | 'low';

export interface ConflictDetail {
  readonly taskA: string;
  readonly taskB: string;
  readonly severity: ConflictSeverity;
  readonly reason: string;
  readonly mitigation: string;
  readonly overlaps: readonly OverlapDetail[];
}

export interface ConflictPrediction {
  readonly tasks: readonly string[];
  readonly analysisLevel: 'graph-expanded' | 'file-only';
  readonly depth: number;
  readonly conflicts: readonly ConflictDetail[];
  readonly groups: readonly (readonly string[])[];
  readonly summary: {
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly regrouped: boolean;
  };
  readonly verdict: string;
}

// --- ConflictPredictor ---

export class ConflictPredictor {
  private readonly store: GraphStore | undefined;

  constructor(store?: GraphStore) {
    this.store = store;
  }

  predict(params: IndependenceCheckParams): ConflictPrediction {
    const analyzer = new TaskIndependenceAnalyzer(this.store);
    const result = analyzer.analyze(params);

    const { churnMap, couplingMap, churnThreshold, couplingThreshold } = this.buildMetricMaps();

    const conflicts = this.classifyConflicts(
      result.pairs,
      churnMap,
      couplingMap,
      churnThreshold,
      couplingThreshold
    );

    const taskIds = result.tasks;
    const groups = this.buildHighSeverityGroups(taskIds, conflicts);
    const regrouped = !this.groupsEqual(result.groups, groups);
    const { highCount, mediumCount, lowCount } = this.countBySeverity(conflicts);

    const verdict = this.generateVerdict(
      taskIds,
      groups,
      result.analysisLevel,
      highCount,
      mediumCount,
      lowCount,
      regrouped
    );

    return {
      tasks: taskIds,
      analysisLevel: result.analysisLevel,
      depth: result.depth,
      conflicts,
      groups,
      summary: { high: highCount, medium: mediumCount, low: lowCount, regrouped },
      verdict,
    };
  }

  // --- Private helpers ---

  private buildMetricMaps(): {
    churnMap: Map<string, number>;
    couplingMap: Map<string, number>;
    churnThreshold: number;
    couplingThreshold: number;
  } {
    const churnMap = new Map<string, number>();
    const couplingMap = new Map<string, number>();

    if (this.store == null) {
      return { churnMap, couplingMap, churnThreshold: Infinity, couplingThreshold: Infinity };
    }

    const complexityResult = new GraphComplexityAdapter(this.store).computeComplexityHotspots();
    for (const hotspot of complexityResult.hotspots) {
      const existing = churnMap.get(hotspot.file);
      if (existing === undefined || hotspot.changeFrequency > existing) {
        churnMap.set(hotspot.file, hotspot.changeFrequency);
      }
    }

    const couplingResult = new GraphCouplingAdapter(this.store).computeCouplingData();
    for (const fileData of couplingResult.files) {
      couplingMap.set(fileData.file, fileData.fanIn + fileData.fanOut);
    }

    const churnThreshold = this.computePercentile(Array.from(churnMap.values()), 80);
    const couplingThreshold = this.computePercentile(Array.from(couplingMap.values()), 80);
    return { churnMap, couplingMap, churnThreshold, couplingThreshold };
  }

  private classifyConflicts(
    pairs: readonly PairResult[],
    churnMap: Map<string, number>,
    couplingMap: Map<string, number>,
    churnThreshold: number,
    couplingThreshold: number
  ): ConflictDetail[] {
    const conflicts: ConflictDetail[] = [];
    for (const pair of pairs) {
      if (pair.independent) continue;
      const { severity, reason, mitigation } = this.classifyPair(
        pair.taskA,
        pair.taskB,
        pair.overlaps,
        churnMap,
        couplingMap,
        churnThreshold,
        couplingThreshold
      );
      conflicts.push({
        taskA: pair.taskA,
        taskB: pair.taskB,
        severity,
        reason,
        mitigation,
        overlaps: pair.overlaps,
      });
    }
    return conflicts;
  }

  private countBySeverity(conflicts: readonly ConflictDetail[]): {
    highCount: number;
    mediumCount: number;
    lowCount: number;
  } {
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    for (const c of conflicts) {
      if (c.severity === 'high') highCount++;
      else if (c.severity === 'medium') mediumCount++;
      else lowCount++;
    }
    return { highCount, mediumCount, lowCount };
  }

  private classifyTransitiveOverlap(
    taskA: string,
    taskB: string,
    overlap: OverlapDetail,
    churnMap: Map<string, number>,
    couplingMap: Map<string, number>,
    churnThreshold: number,
    couplingThreshold: number
  ): { severity: ConflictSeverity; reason: string; mitigation: string } {
    const churn = churnMap.get(overlap.file);
    const coupling = couplingMap.get(overlap.file);
    const via = overlap.via ?? 'unknown';

    if (churn !== undefined && churn >= churnThreshold && churnThreshold !== Infinity) {
      return {
        severity: 'medium',
        reason: `Transitive overlap on high-churn file ${overlap.file} (via ${via})`,
        mitigation: `Review: ${overlap.file} changes frequently — coordinate edits between ${taskA} and ${taskB}`,
      };
    }

    if (coupling !== undefined && coupling >= couplingThreshold && couplingThreshold !== Infinity) {
      return {
        severity: 'medium',
        reason: `Transitive overlap on highly-coupled file ${overlap.file} (via ${via})`,
        mitigation: `Review: ${overlap.file} has high coupling — coordinate edits between ${taskA} and ${taskB}`,
      };
    }

    return {
      severity: 'low',
      reason: `Transitive overlap on ${overlap.file} (via ${via}) — low risk`,
      mitigation: `Info: transitive overlap unlikely to cause conflicts`,
    };
  }

  private classifyPair(
    taskA: string,
    taskB: string,
    overlaps: readonly OverlapDetail[],
    churnMap: Map<string, number>,
    couplingMap: Map<string, number>,
    churnThreshold: number,
    couplingThreshold: number
  ): { severity: ConflictSeverity; reason: string; mitigation: string } {
    let maxSeverity: ConflictSeverity = 'low';
    let primaryReason = '';
    let primaryMitigation = '';

    for (const overlap of overlaps) {
      const classified =
        overlap.type === 'direct'
          ? {
              severity: 'high' as ConflictSeverity,
              reason: `Both tasks write to ${overlap.file}`,
              mitigation: `Serialize: run ${taskA} before ${taskB}`,
            }
          : this.classifyTransitiveOverlap(
              taskA,
              taskB,
              overlap,
              churnMap,
              couplingMap,
              churnThreshold,
              couplingThreshold
            );

      if (this.severityRank(classified.severity) > this.severityRank(maxSeverity)) {
        maxSeverity = classified.severity;
        primaryReason = classified.reason;
        primaryMitigation = classified.mitigation;
      } else if (primaryReason === '') {
        primaryReason = classified.reason;
        primaryMitigation = classified.mitigation;
      }
    }

    return { severity: maxSeverity, reason: primaryReason, mitigation: primaryMitigation };
  }

  private severityRank(severity: ConflictSeverity): number {
    switch (severity) {
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
    }
  }

  private computePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return Infinity;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.min(index, sorted.length - 1)]!;
  }

  private buildHighSeverityGroups(
    taskIds: readonly string[],
    conflicts: readonly ConflictDetail[]
  ): readonly (readonly string[])[] {
    // Union-find: only merge on high-severity edges
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    for (const id of taskIds) {
      parent.set(id, id);
      rank.set(id, 0);
    }

    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      // Path compression
      let current = x;
      while (current !== root) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    };

    const union = (a: string, b: string): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA === rootB) return;
      const rankA = rank.get(rootA)!;
      const rankB = rank.get(rootB)!;
      if (rankA < rankB) {
        parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        parent.set(rootB, rootA);
      } else {
        parent.set(rootB, rootA);
        rank.set(rootA, rankA + 1);
      }
    };

    // Only union high-severity conflicts
    for (const conflict of conflicts) {
      if (conflict.severity === 'high') {
        union(conflict.taskA, conflict.taskB);
      }
    }

    // Collect groups
    const groupMap = new Map<string, string[]>();
    for (const id of taskIds) {
      const root = find(id);
      let group = groupMap.get(root);
      if (group === undefined) {
        group = [];
        groupMap.set(root, group);
      }
      group.push(id);
    }

    return Array.from(groupMap.values());
  }

  private groupsEqual(
    a: readonly (readonly string[])[],
    b: readonly (readonly string[])[]
  ): boolean {
    if (a.length !== b.length) return false;

    // Normalize: sort each group, then sort groups by first element
    const normalize = (groups: readonly (readonly string[])[]): string[][] =>
      groups
        .map((g) => [...g].sort())
        .sort((x, y) => {
          const xFirst = x[0]!;
          const yFirst = y[0]!;
          return xFirst.localeCompare(yFirst);
        });

    const normA = normalize(a);
    const normB = normalize(b);

    for (let i = 0; i < normA.length; i++) {
      const groupA = normA[i]!;
      const groupB = normB[i]!;
      if (groupA.length !== groupB.length) return false;
      for (let j = 0; j < groupA.length; j++) {
        if (groupA[j] !== groupB[j]) return false;
      }
    }

    return true;
  }

  private generateVerdict(
    taskIds: readonly string[],
    groups: readonly (readonly string[])[],
    analysisLevel: 'graph-expanded' | 'file-only',
    highCount: number,
    mediumCount: number,
    lowCount: number,
    regrouped: boolean
  ): string {
    const total = taskIds.length;
    const groupCount = groups.length;
    const parts: string[] = [];

    // Conflict summary
    const conflictParts: string[] = [];
    if (highCount > 0) conflictParts.push(`${highCount} high`);
    if (mediumCount > 0) conflictParts.push(`${mediumCount} medium`);
    if (lowCount > 0) conflictParts.push(`${lowCount} low`);

    if (conflictParts.length === 0) {
      parts.push(`${total} tasks have no conflicts — can all run in parallel.`);
    } else {
      parts.push(`${total} tasks have ${conflictParts.join(', ')} severity conflicts.`);
    }

    // Group summary
    if (groupCount === 1) {
      parts.push(`All tasks must run serially.`);
    } else if (groupCount === total) {
      parts.push(`${groupCount} parallel groups (all independent).`);
    } else {
      parts.push(`${groupCount} parallel groups possible.`);
    }

    // Regrouping note
    if (regrouped) {
      parts.push(`Tasks were regrouped due to high-severity conflicts.`);
    }

    // Degradation note
    if (analysisLevel === 'file-only') {
      parts.push(`Graph unavailable — severity based on file overlaps only.`);
    }

    return parts.join(' ');
  }
}
