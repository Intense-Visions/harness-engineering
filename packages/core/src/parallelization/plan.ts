import type { ConflictPrediction, ConflictSeverity } from '@harness-engineering/graph';
import type { PlanTask } from '@harness-engineering/types';
import type { GraphNode } from '../review/types';

/** Per-wave firing decision (Phase 1: basic derivation; Phase 2 refines). */
export type FiringDecision = 'auto-dispatch' | 'confirm' | 'serialize';

/** Wave severity spans conflict severities plus "none" (no conflicts in wave). */
export type WaveSeverity = 'none' | ConflictSeverity; // 'none' | 'low' | 'medium' | 'high'

export interface ParallelizationWave {
  tasks: string[];
  severity: WaveSeverity;
  firing: FiringDecision;
  analysisLevel: 'graph-expanded' | 'file-only';
}

export interface ParallelizationPlan {
  waves: ParallelizationWave[];
  /** Tasks forced serial (high-severity group members / cycle members). */
  serialized: string[];
  /** Dependency cycles (blocking). */
  cyclic: string[];
  /** Human-readable DAG summary for announce-and-proceed. */
  narration: string;
}

export interface PlanParallelizationInput {
  tasks: PlanTask[];
  conflicts: ConflictPrediction;
  /** Minimum independent tasks in a wave to justify parallel dispatch. Default 3. */
  minWaveSize?: number;
}

/** Result of validating plan-task dependency structure. */
export interface PlanTaskValidation {
  errors: string[];
  warnings: string[];
}

/** Union of a task's declared file touches and owned globs (exact-string set). */
function footprintOf(task: PlanTask): Set<string> {
  const files = task.files || [];
  const owns = task.owns || [];
  return new Set<string>([...files, ...owns]);
}

/** True when two footprints share at least one exact entry. */
function shareFootprint(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  if (!a || !b) return false;
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

/** Record that `consumer` depends on `producer` (idempotent via Set). */
function addDependency(
  deps: Map<string, Set<string>>,
  consumer: PlanTask | undefined,
  producer: PlanTask | undefined
): void {
  if (!consumer || !producer) return;
  const consumerDeps = deps.get(consumer.id);
  if (consumerDeps) consumerDeps.add(producer.id);
}

/** Materialize a task's accumulated dependency set into a sorted GraphNode. */
function toGraphNode(task: PlanTask, deps: Map<string, Set<string>>): GraphNode {
  const set = deps.get(task.id) || new Set<string>();
  return { id: task.id, dependsOn: [...set].sort() };
}

/**
 * Build the task DAG consumed by findParallelGroups: explicit `dependsOn`
 * edges unioned with implicit file/`owns` overlap edges. Overlap edges are
 * oriented earlier-declared -> later-declared for determinism.
 */
export function buildTaskGraph(tasks: readonly PlanTask[]): GraphNode[] {
  const footprints = tasks.map(footprintOf);
  const deps = new Map<string, Set<string>>();
  for (const task of tasks) {
    deps.set(task.id, new Set(task.dependsOn || []));
  }

  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      if (shareFootprint(footprints[i], footprints[j])) {
        // later-declared (j) depends on earlier-declared (i)
        addDependency(deps, tasks[j], tasks[i]);
      }
    }
  }

  return tasks.map((task) => toGraphNode(task, deps));
}
