import type { ConflictPrediction, ConflictSeverity } from '@harness-engineering/graph';
import type { PlanTask } from '@harness-engineering/types';
import { findParallelGroups } from '../review/parallel-groups';
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
  /**
   * Auto/confirm-dispatch waves. Flattened `waves`, `serialized`, and `cyclic`
   * are mutually disjoint: a task appears in exactly one channel.
   */
  waves: ParallelizationWave[];
  /**
   * Tasks forced serial (high-severity group members / cycle members). These
   * are removed from `waves` — never dispatched in parallel.
   */
  serialized: string[];
  /** Dependency cycles (blocking). Disjoint from `waves` and `serialized`. */
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

/**
 * Validate plan-task dependency structure.
 *
 * Hard errors: `dependsOn` referencing an unknown task id; dependency cycles.
 * Warning: a task depending on a task declared LATER in the input (consumer
 * before producer) — the plan lists them out of natural order.
 */
export function validatePlanTasks(tasks: readonly PlanTask[]): PlanTaskValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const index = new Map<string, number>();
  tasks.forEach((t, i) => index.set(t.id, i));

  for (const t of tasks) {
    for (const dep of t.dependsOn || []) {
      if (!index.has(dep)) {
        errors.push(`Task "${t.id}" depends on unknown task id "${dep}".`);
        continue;
      }
      if (index.get(dep)! > index.get(t.id)!) {
        warnings.push(
          `Task "${t.id}" depends on "${dep}" which is declared later (consumer before producer).`
        );
      }
    }
  }

  // Cycle detection reuses buildTaskGraph + findParallelGroups over the SAME
  // combined graph the planner uses (explicit dependsOn ∪ implicit file/owns
  // overlap edges), so validation and planParallelization agree on what a cycle
  // is — a set the planner drops into `cyclic` is never validated as clean.
  const { cyclic } = findParallelGroups(buildTaskGraph(tasks));
  if (cyclic.length > 0) {
    errors.push(`Dependency cycle detected among tasks: ${cyclic.join(', ')}.`);
  }

  return { errors, warnings };
}

const SEVERITY_RANK: Record<WaveSeverity, number> = { none: 0, low: 1, medium: 2, high: 3 };

/** Highest conflict severity among the given task ids, from the conflict result. */
export function waveSeverity(
  taskIds: readonly string[],
  conflicts: ConflictPrediction
): WaveSeverity {
  const set = new Set(taskIds);
  let max: WaveSeverity = 'none';
  for (const c of conflicts.conflicts) {
    if (!set.has(c.taskA) || !set.has(c.taskB)) continue;
    if (SEVERITY_RANK[c.severity] > SEVERITY_RANK[max]) max = c.severity;
  }
  return max;
}

/** A firing decision paired with its standardized, deterministic rationale. */
export interface FiringRationale {
  firing: FiringDecision;
  /** Human-readable "why" phrase consumed by narrate(). Never empty. */
  reason: string;
}

/**
 * Full risk-tiered firing policy (Decision 2), keyed off BOTH conflict
 * severity and analysisLevel. Returns the decision AND a standardized
 * rationale phrase. Decision order matches the Phase-1 deriveFiring so
 * existing behavior is preserved and now locked by the truth table.
 *
 *   high severity              -> serialize (sequential)
 *   waveSize < minWaveSize      -> serialize (too few to parallelize)
 *   medium severity            -> confirm  (one confirmation)
 *   analysisLevel 'file-only'  -> confirm  (transitive conflicts unknown)
 *   none/low + graph-expanded  -> auto-dispatch
 */
export function classifyFiring(
  severity: WaveSeverity,
  waveSize: number,
  minWaveSize: number,
  analysisLevel: 'graph-expanded' | 'file-only'
): FiringRationale {
  if (severity === 'high') {
    return {
      firing: 'serialize',
      reason: 'high-severity conflicts predicted — running these tasks sequentially',
    };
  }
  if (waveSize < minWaveSize) {
    return {
      firing: 'serialize',
      reason: `only ${waveSize} independent task(s), below minimum wave size ${minWaveSize} — running serially`,
    };
  }
  if (severity === 'medium') {
    return {
      firing: 'confirm',
      reason: 'medium-severity conflicts predicted — one confirmation before dispatch',
    };
  }
  if (analysisLevel === 'file-only') {
    return {
      firing: 'confirm',
      reason:
        'graph unavailable (file-only analysis) — transitive conflicts unknown, one confirmation before dispatch',
    };
  }
  return {
    firing: 'auto-dispatch',
    reason: `${waveSize} independent tasks, ${
      severity === 'none' ? 'no' : severity
    } conflict severity, graph-expanded analysis — dispatching in parallel`,
  };
}

/**
 * Firing decision only — thin wrapper preserving the Phase-1 signature.
 * Delegates to classifyFiring so decision logic lives in exactly one place.
 */
export function deriveFiring(
  severity: WaveSeverity,
  waveSize: number,
  minWaveSize: number,
  analysisLevel: 'graph-expanded' | 'file-only'
): FiringDecision {
  return classifyFiring(severity, waveSize, minWaveSize, analysisLevel).firing;
}

/**
 * Rich, deterministic DAG summary for announce-and-proceed — the reproducible
 * version of a hand-written "Phase 1 blocks 2&3, they're disjoint, dispatching
 * 2∥3; Phase 4 integrates". Per wave: names the tasks, the upstream tasks it
 * waits on (from the built DAG), and the firing decision with its reason.
 *
 * `reasons[i]` is the rationale for `waves[i]` (parallel arrays). Derived
 * purely from sorted inputs, so output is deterministic.
 */
export function narrate(
  waves: readonly ParallelizationWave[],
  reasons: readonly string[],
  serialized: readonly string[],
  cyclic: readonly string[],
  nodes: readonly GraphNode[]
): string {
  const depMap = new Map<string, readonly string[]>();
  for (const node of nodes) depMap.set(node.id, node.dependsOn);

  // Channel labels so a cross-bucket prerequisite (a task dispatched via the
  // serialized/cyclic channel) reads differently from a plain earlier-wave
  // dependency. `serialized` already folds in `cyclic`, so test `cyclic` first.
  const cyclicSet = new Set(cyclic);
  const serializedSet = new Set(serialized);
  const labelDep = (id: string): string => {
    if (cyclicSet.has(id)) return `${id} (cyclic)`;
    if (serializedSet.has(id)) return `${id} (serialized)`;
    return id;
  };

  const lines: string[] = [
    `Parallelization: ${waves.length} wave(s), ${serialized.length} serialized, ${cyclic.length} cyclic.`,
  ];

  waves.forEach((w, i) => {
    const waveSet = new Set(w.tasks);
    const blocking = [...new Set(w.tasks.flatMap((t) => depMap.get(t) ?? []))]
      .filter((id) => !waveSet.has(id))
      .sort();
    const crossBucket = blocking.some((id) => serializedSet.has(id));
    const waitClause = blocking.length
      ? `waits on ${blocking.map(labelDep).join(', ')}${
          crossBucket ? ' (cross-bucket prerequisite gates this wave)' : ''
        }`
      : 'no upstream dependencies (root wave)';
    lines.push(
      `Wave ${i + 1} [${w.tasks.join(', ')}]: ${waitClause}; ${w.firing}: ${reasons[i] ?? ''}.`
    );
  });

  if (serialized.length > 0) {
    lines.push(
      `Serialized (run sequentially): [${serialized.join(
        ', '
      )}] — high-severity conflict members or dependency-cycle members.`
    );
  }
  if (cyclic.length > 0) {
    lines.push(
      `Cyclic (blocked): [${cyclic.join(', ')}] — dependency cycle; resolve before scheduling.`
    );
  }

  return lines.join('\n');
}

const DEFAULT_MIN_WAVE_SIZE = 3;

/** Members of conflict groups larger than one task (i.e. flagged to co-serialize). */
function highRiskGroupMembers(conflicts: ConflictPrediction): string[] {
  const members: string[] = [];
  for (const group of conflicts.groups) {
    if (group.length > 1) members.push(...group);
  }
  return members;
}

/**
 * Plan safe parallel execution for a set of plan tasks.
 *
 * Steps: build the task DAG (explicit dependsOn unioned with file/owns
 * overlap) -> wave-group via findParallelGroups -> annotate each wave with
 * highest conflict severity + a firing decision -> emit ParallelizationPlan.
 *
 * Cycles are surfaced via `cyclic` (and folded into `serialized`); this
 * function does not throw. Use `validatePlanTasks` for hard-error reporting.
 *
 * Guarantees the dispatch channels are mutually disjoint: flattened `waves`,
 * `serialized`, and `cyclic` never share a task id.
 */
export function planParallelization(input: PlanParallelizationInput): ParallelizationPlan {
  const { tasks, conflicts } = input;
  const minWaveSize = input.minWaveSize ?? DEFAULT_MIN_WAVE_SIZE;

  const nodes = buildTaskGraph(tasks);
  const { waves: rawWaves, cyclic } = findParallelGroups(nodes);

  // serialized = members of high-severity groups (size > 1) ∪ cyclic members.
  // `serializedSet` therefore IS exactly `serialized ∪ cyclic` — the set of
  // tasks dispatched through a NON-wave channel — and is reused below as the
  // cross-bucket membership test.
  const serializedSet = new Set<string>(cyclic);
  for (const id of highRiskGroupMembers(conflicts)) serializedSet.add(id);
  const serialized = [...serializedSet].sort();

  // Direct-dependency lookup over the SAME combined graph the waves came from
  // (explicit dependsOn ∪ implicit file/owns overlap). Used to detect
  // cross-bucket prerequisites: a wave task depending on a task that runs in
  // the serialized/cyclic channel rather than in an earlier wave.
  const depMap = new Map<string, readonly string[]>();
  for (const node of nodes) depMap.set(node.id, node.dependsOn);

  // Invariant: waves (flattened), `serialized`, and `cyclic` are MUTUALLY
  // DISJOINT dispatch channels. Any task forced serial or in a cycle is
  // removed from its wave; waves emptied by that removal are dropped. (Cyclic
  // members are already absent from rawWaves, but excluding them keeps the
  // invariant explicit and robust to changes in findParallelGroups.)
  const reasons: string[] = [];
  const waves: ParallelizationWave[] = rawWaves
    .map((taskIds) => taskIds.filter((id) => !serializedSet.has(id)))
    .filter((taskIds) => taskIds.length > 0)
    .map((taskIds) => {
      const severity = waveSeverity(taskIds, conflicts);
      let { firing, reason } = classifyFiring(
        severity,
        taskIds.length,
        minWaveSize,
        conflicts.analysisLevel
      );

      // Cross-bucket ordering guard (P2-IMP-1). If any direct upstream of this
      // wave runs in the serialized/cyclic channel, that prerequisite is NOT
      // dispatched as a parallel-safe wave — a human / Phase-3 gate must stand
      // between them. Cap an otherwise auto-dispatch wave at `confirm` (never
      // weaker; never forced all the way to `serialize`). Waves already at
      // confirm/serialize are left untouched — they are already gated.
      const waveSet = new Set(taskIds);
      const crossBucketUpstream = [...new Set(taskIds.flatMap((t) => depMap.get(t) ?? []))]
        .filter((id) => !waveSet.has(id) && serializedSet.has(id))
        .sort();
      if (crossBucketUpstream.length > 0 && firing === 'auto-dispatch') {
        firing = 'confirm';
        reason = `depends on ${crossBucketUpstream.join(
          ', '
        )} running in the serialized/cyclic channel — cross-bucket prerequisite not parallel-safe, one confirmation before dispatch`;
      }

      reasons.push(reason);
      return { tasks: taskIds, severity, firing, analysisLevel: conflicts.analysisLevel };
    });

  return {
    waves,
    serialized,
    cyclic,
    narration: narrate(waves, reasons, serialized, cyclic, nodes),
  };
}
