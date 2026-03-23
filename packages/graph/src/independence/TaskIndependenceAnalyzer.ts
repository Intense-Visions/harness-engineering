import type { GraphStore } from '../store/GraphStore.js';
import type { EdgeType } from '../types.js';
import { ContextQL } from '../query/ContextQL.js';

// --- Public types ---

export interface TaskDefinition {
  readonly id: string;
  readonly files: readonly string[];
}

export interface IndependenceCheckParams {
  readonly tasks: readonly TaskDefinition[];
  readonly depth?: number;
  readonly edgeTypes?: readonly string[];
}

export interface OverlapDetail {
  readonly file: string;
  readonly type: 'direct' | 'transitive';
  readonly via?: string;
}

export interface PairResult {
  readonly taskA: string;
  readonly taskB: string;
  readonly independent: boolean;
  readonly overlaps: readonly OverlapDetail[];
}

export interface IndependenceResult {
  readonly tasks: readonly string[];
  readonly analysisLevel: 'graph-expanded' | 'file-only';
  readonly depth: number;
  readonly pairs: readonly PairResult[];
  readonly groups: readonly (readonly string[])[];
  readonly verdict: string;
}

// --- Default edge types for expansion ---

const DEFAULT_EDGE_TYPES: readonly EdgeType[] = ['imports', 'calls', 'references'];

// --- Analyzer ---

export class TaskIndependenceAnalyzer {
  private readonly store: GraphStore | undefined;

  constructor(store?: GraphStore) {
    this.store = store;
  }

  analyze(params: IndependenceCheckParams): IndependenceResult {
    const { tasks } = params;
    const depth = params.depth ?? 1;
    const edgeTypes = (params.edgeTypes ?? DEFAULT_EDGE_TYPES) as readonly EdgeType[];

    // --- Validation ---
    this.validate(tasks);

    // --- Determine analysis level ---
    const useGraph = this.store != null && depth > 0;
    const analysisLevel: 'graph-expanded' | 'file-only' = useGraph ? 'graph-expanded' : 'file-only';

    // --- Expand file sets ---
    // originalFiles: Map<taskId, Set<file>>
    // expandedFiles: Map<taskId, Map<file, sourceFile>> (expanded file -> which original file led to it)
    const originalFiles = new Map<string, Set<string>>();
    const expandedFiles = new Map<string, Map<string, string>>();

    for (const task of tasks) {
      const origSet = new Set(task.files);
      originalFiles.set(task.id, origSet);

      if (useGraph) {
        const expanded = this.expandViaGraph(task.files, depth, edgeTypes);
        expandedFiles.set(task.id, expanded);
      } else {
        expandedFiles.set(task.id, new Map());
      }
    }

    // --- Compute pairwise overlaps ---
    const taskIds = tasks.map((t) => t.id);
    const pairs: PairResult[] = [];

    for (let i = 0; i < taskIds.length; i++) {
      for (let j = i + 1; j < taskIds.length; j++) {
        const idA = taskIds[i]!;
        const idB = taskIds[j]!;
        const pair = this.computePairOverlap(
          idA,
          idB,
          originalFiles.get(idA)!,
          originalFiles.get(idB)!,
          expandedFiles.get(idA)!,
          expandedFiles.get(idB)!
        );
        pairs.push(pair);
      }
    }

    // --- Build parallel groups via union-find ---
    const groups = this.buildGroups(taskIds, pairs);

    // --- Generate verdict ---
    const verdict = this.generateVerdict(taskIds, groups, analysisLevel);

    return {
      tasks: taskIds,
      analysisLevel,
      depth,
      pairs,
      groups,
      verdict,
    };
  }

  // --- Private methods ---

  private validate(tasks: readonly TaskDefinition[]): void {
    const seenIds = new Set<string>();
    for (const task of tasks) {
      if (seenIds.has(task.id)) {
        throw new Error(`Duplicate task ID: "${task.id}"`);
      }
      seenIds.add(task.id);

      if (task.files.length === 0) {
        throw new Error(`Task "${task.id}" has an empty files array`);
      }
    }
  }

  private expandViaGraph(
    files: readonly string[],
    depth: number,
    edgeTypes: readonly EdgeType[]
  ): Map<string, string> {
    // Returns Map<expandedFilePath, sourceOriginalFile>
    const result = new Map<string, string>();
    const store = this.store!;
    const cql = new ContextQL(store);

    for (const file of files) {
      const nodeId = `file:${file}`;
      // Only expand if the node exists in the graph
      const node = store.getNode(nodeId);
      if (!node) continue;

      const queryResult = cql.execute({
        rootNodeIds: [nodeId],
        maxDepth: depth,
        includeEdges: edgeTypes,
        includeTypes: ['file'],
      });

      for (const n of queryResult.nodes) {
        // Extract the file path from the node ID (strip 'file:' prefix)
        const path = n.path ?? n.id.replace(/^file:/, '');
        // Do not include original files in the expanded set
        if (!files.includes(path)) {
          // Only record the first source (first original file that led here)
          if (!result.has(path)) {
            result.set(path, file);
          }
        }
      }
    }

    return result;
  }

  private computePairOverlap(
    idA: string,
    idB: string,
    origA: Set<string>,
    origB: Set<string>,
    expandedA: Map<string, string>,
    expandedB: Map<string, string>
  ): PairResult {
    const overlaps: OverlapDetail[] = [];

    // Direct overlaps: intersection of original file lists
    for (const file of origA) {
      if (origB.has(file)) {
        overlaps.push({ file, type: 'direct' });
      }
    }

    // Transitive overlaps: expanded files from A that appear in B's original or expanded,
    // and expanded files from B that appear in A's original — excluding direct overlaps
    const directFiles = new Set(overlaps.map((o) => o.file));
    const transitiveFiles = new Set<string>();

    // A's expanded files overlapping with B's original files
    for (const [file, via] of expandedA) {
      if (origB.has(file) && !directFiles.has(file) && !transitiveFiles.has(file)) {
        transitiveFiles.add(file);
        overlaps.push({ file, type: 'transitive', via });
      }
    }

    // B's expanded files overlapping with A's original files
    for (const [file, via] of expandedB) {
      if (origA.has(file) && !directFiles.has(file) && !transitiveFiles.has(file)) {
        transitiveFiles.add(file);
        overlaps.push({ file, type: 'transitive', via });
      }
    }

    // A's expanded files overlapping with B's expanded files
    for (const [file, viaA] of expandedA) {
      if (expandedB.has(file) && !directFiles.has(file) && !transitiveFiles.has(file)) {
        transitiveFiles.add(file);
        overlaps.push({ file, type: 'transitive', via: viaA });
      }
    }

    return {
      taskA: idA,
      taskB: idB,
      independent: overlaps.length === 0,
      overlaps,
    };
  }

  private buildGroups(
    taskIds: readonly string[],
    pairs: readonly PairResult[]
  ): readonly (readonly string[])[] {
    // Union-find
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

    // Union conflicting task pairs
    for (const pair of pairs) {
      if (!pair.independent) {
        union(pair.taskA, pair.taskB);
      }
    }

    // Collect groups
    const groupMap = new Map<string, string[]>();
    for (const id of taskIds) {
      const root = find(id);
      if (!groupMap.has(root)) {
        groupMap.set(root, []);
      }
      groupMap.get(root)!.push(id);
    }

    return Array.from(groupMap.values());
  }

  private generateVerdict(
    taskIds: readonly string[],
    groups: readonly (readonly string[])[],
    analysisLevel: 'graph-expanded' | 'file-only'
  ): string {
    const total = taskIds.length;
    const groupCount = groups.length;

    let verdict: string;
    if (groupCount === 1) {
      verdict = `All ${total} tasks conflict — must run serially.`;
    } else if (groupCount === total) {
      verdict = `All ${total} tasks are independent — can all run in parallel.`;
    } else {
      verdict = `${total} tasks form ${groupCount} independent groups — ${groupCount} parallel waves possible.`;
    }

    if (analysisLevel === 'file-only') {
      verdict += ' Graph unavailable — transitive dependencies not checked.';
    }

    return verdict;
  }
}
