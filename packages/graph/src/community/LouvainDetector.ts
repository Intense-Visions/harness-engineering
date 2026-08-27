import type {
  CommunityDetector,
  CommunityDetectionResult,
  CommunityGraphInput,
  CommunityDetectorOptions,
} from './CommunityDetector.js';

/**
 * Louvain community detection: greedy modularity maximization via the classic
 * two-phase scheme (local node moves, then aggregation of communities into
 * super-nodes), repeated across levels until modularity stops improving.
 *
 * Self-contained — no external graph dependency. The graph is treated as
 * undirected; parallel/anti-parallel edges between the same pair of nodes have
 * their weights summed. Deterministic given a seed (or its absence): node
 * processing order and community tie-breaks are fixed, so repeated runs over
 * the same graph return identical labels.
 */
export class LouvainDetector implements CommunityDetector {
  readonly name = 'louvain';

  detect(
    input: CommunityGraphInput,
    options: CommunityDetectorOptions = {}
  ): CommunityDetectionResult {
    const resolution = options.resolution ?? 1;
    const maxPasses = options.maxPasses ?? 32;
    const order = processingOrder(input.nodeIds.length, options.seed);

    const level0 = buildLevel(input);

    // node2com per level, and the running mapping from original node index to
    // the current level's node index.
    let level = level0;
    let originalToLevelNode: number[] = input.nodeIds.map((_, i) => i);
    const originalToCommunity: number[] = input.nodeIds.map(() => 0);

    // The level-0 processing order; for aggregated levels we fall back to
    // natural (index) order which is already deterministic.
    let levelOrder: number[] | null = order;

    for (;;) {
      const raw = oneLevel(level, resolution, maxPasses, levelOrder);
      const before = modularity(level, identityPartition(level.size), resolution);
      const after = modularity(level, raw, resolution);

      // Compact community ids to a dense [0, communityCount) range up front, so
      // the labels line up with the node indices `aggregate` will produce for
      // the next level (otherwise the level->node mapping would index with
      // stale, sparse ids).
      const { labels: node2com, count: communityCount } = canonicalize(raw);

      // Propagate this level's partition down onto the original nodes.
      for (let i = 0; i < originalToCommunity.length; i++) {
        originalToCommunity[i] = node2com[originalToLevelNode[i]!]!;
      }
      originalToLevelNode = originalToLevelNode.map((ln) => node2com[ln]!);

      // Stop when a pass yields no meaningful improvement or collapses to a
      // single node.
      const improved = after - before > 1e-9;
      if (!improved || communityCount === level.size || communityCount <= 1) {
        break;
      }

      level = aggregate(level, node2com, communityCount);
      levelOrder = null; // natural order for aggregated levels
    }

    // Canonicalize community ids to [0, k) in order of first appearance so the
    // labeling is stable and comparable across runs.
    const canonical = canonicalize(originalToCommunity);
    const assignments = input.nodeIds.map((nodeId, i) => ({
      nodeId,
      community: canonical.labels[i]!,
    }));
    const finalModularity = modularity(level0, canonical.labels, resolution);

    return {
      assignments,
      communityCount: canonical.count,
      modularity: finalModularity,
    };
  }
}

// --- Level representation ---

/** Accumulate `delta` into `map[key]`, treating a missing key as 0. */
function bump(map: Map<number, number>, key: number, delta: number): void {
  map.set(key, (map.get(key) ?? 0) + delta);
}

/**
 * Finalize a level from per-node adjacency maps and self-loops: freeze
 * adjacency into sorted lists (deterministic iteration) and derive weighted
 * degrees and the total edge weight `m = sum(degrees) / 2`.
 */
function makeLevel(
  size: number,
  adjMaps: ReadonlyArray<Map<number, number>>,
  loops: readonly number[]
): Level {
  const adjacency: Array<Array<[number, number]>> = adjMaps.map((m) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, w]) => [n, w] as [number, number])
  );
  const degrees = new Array<number>(size).fill(0);
  for (let i = 0; i < size; i++) {
    let d = 2 * loops[i]!;
    for (const [, w] of adjacency[i]!) d += w;
    degrees[i] = d;
  }
  const totalWeight = degrees.reduce((s, d) => s + d, 0) / 2;
  return { size, adjacency, loops, degrees, totalWeight };
}

interface Level {
  readonly size: number;
  /** adjacency[i] = list of [neighbor, weight] with neighbor !== i. */
  readonly adjacency: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  /** self-loop weight per node. */
  readonly loops: readonly number[];
  /** weighted degree per node (self-loops counted twice). */
  readonly degrees: readonly number[];
  /** total edge weight m = sum(degrees) / 2. */
  readonly totalWeight: number;
}

function buildLevel(input: CommunityGraphInput): Level {
  const index = new Map<string, number>();
  input.nodeIds.forEach((id, i) => index.set(id, i));
  const size = input.nodeIds.length;

  const adjMaps: Array<Map<number, number>> = Array.from({ length: size }, () => new Map());
  const loops = new Array<number>(size).fill(0);

  for (const edge of input.edges) {
    const u = index.get(edge.source);
    const v = index.get(edge.target);
    if (u === undefined || v === undefined) continue; // ignore dangling edges
    const w = edge.weight ?? 1;
    if (w <= 0) continue;
    if (u === v) {
      loops[u]! += w;
      continue;
    }
    bump(adjMaps[u]!, v, w);
    bump(adjMaps[v]!, u, w);
  }

  return makeLevel(size, adjMaps, loops);
}

// --- Phase 1: local moving ---

/**
 * Greedily move nodes to neighboring communities to increase modularity.
 * Returns the resulting community id per node (not yet canonicalized).
 */
function oneLevel(
  level: Level,
  resolution: number,
  maxPasses: number,
  order: number[] | null
): number[] {
  const { size, adjacency, degrees, totalWeight } = level;
  const node2com = Array.from({ length: size }, (_, i) => i);
  // comTot[c] = sum of degrees of nodes currently in community c.
  const comTot = degrees.slice();

  if (totalWeight === 0) return node2com; // no edges -> every node isolated

  const twoM = 2 * totalWeight;
  const nodeOrder = order ?? Array.from({ length: size }, (_, i) => i);

  let modified = true;
  let pass = 0;
  while (modified && pass < maxPasses) {
    modified = false;
    pass++;
    for (const node of nodeOrder) {
      const nodeCom = node2com[node]!;
      const nodeDeg = degrees[node]!;
      const degcTotw = nodeDeg / twoM;

      // weight from `node` to each neighboring community.
      const neighWeight = neighborCommunityWeights(adjacency[node]!, node2com);

      // Remove node from its current community.
      comTot[nodeCom] = comTot[nodeCom]! - nodeDeg;
      const removeCost =
        -(neighWeight.get(nodeCom) ?? 0) + resolution * comTot[nodeCom]! * degcTotw;

      let bestCom = nodeCom;
      let bestIncrease = 0;
      // Deterministic tie-break: ascending community id.
      const coms = [...neighWeight.keys()].sort((a, b) => a - b);
      for (const com of coms) {
        const dnc = neighWeight.get(com) ?? 0;
        const increase = removeCost + dnc - resolution * comTot[com]! * degcTotw;
        if (increase > bestIncrease + 1e-12) {
          bestIncrease = increase;
          bestCom = com;
        }
      }

      // Re-insert node into the best community.
      comTot[bestCom] = comTot[bestCom]! + nodeDeg;
      node2com[node] = bestCom;
      if (bestCom !== nodeCom) modified = true;
    }
  }

  return node2com;
}

function neighborCommunityWeights(
  adjacency: ReadonlyArray<readonly [number, number]>,
  node2com: readonly number[]
): Map<number, number> {
  const weights = new Map<number, number>();
  for (const [neighbor, w] of adjacency) {
    bump(weights, node2com[neighbor]!, w);
  }
  return weights;
}

// --- Phase 2: aggregation ---

/** Collapse each community into a single super-node, summing edge weights. */
function aggregate(level: Level, node2com: readonly number[], communityCount: number): Level {
  // Renumber communities to a dense [0, communityCount) range.
  const remap = new Map<number, number>();
  let next = 0;
  const compact = node2com.map((c) => {
    let m = remap.get(c);
    if (m === undefined) {
      m = next++;
      remap.set(c, m);
    }
    return m;
  });
  const size = communityCount;

  const adjMaps: Array<Map<number, number>> = Array.from({ length: size }, () => new Map());
  const loops = new Array<number>(size).fill(0);

  // Carry forward existing self-loops.
  for (let i = 0; i < level.size; i++) {
    const ci = compact[i]!;
    loops[ci] = loops[ci]! + level.loops[i]!;
  }
  // Each undirected edge appears twice in adjacency lists; halve by only
  // consuming the u<neighbor direction, and add internal edges to loops.
  for (let u = 0; u < level.size; u++) {
    const cu = compact[u]!;
    for (const [v, w] of level.adjacency[u]!) {
      if (v < u) continue; // count each undirected edge once
      const cv = compact[v]!;
      if (cu === cv) {
        loops[cu] = loops[cu]! + w;
      } else {
        bump(adjMaps[cu]!, cv, w);
        bump(adjMaps[cv]!, cu, w);
      }
    }
  }

  return makeLevel(size, adjMaps, loops);
}

// --- Modularity ---

/**
 * Modularity of a partition on a level:
 *   Q = sum_c [ internal_c / m - (sigmaTot_c / 2m)^2 * resolution ]
 * where internal_c is total internal edge weight (self-loops once) and
 * sigmaTot_c is the summed weighted degree of community c.
 */
function modularity(level: Level, node2com: readonly number[], resolution: number): number {
  const m = level.totalWeight;
  if (m === 0) return 0;

  const { internal, sigmaTot } = accumulateCommunities(level, node2com);

  let q = 0;
  for (const c of sigmaTot.keys()) {
    const inC = internal.get(c) ?? 0;
    const tot = sigmaTot.get(c) ?? 0;
    q += inC / m - resolution * (tot / (2 * m)) ** 2;
  }
  return q;
}

/**
 * Per-community internal edge weight (self-loops once) and summed weighted
 * degree, for the modularity sum.
 */
function accumulateCommunities(
  level: Level,
  node2com: readonly number[]
): { internal: Map<number, number>; sigmaTot: Map<number, number> } {
  const { size, adjacency, loops, degrees } = level;
  const internal = new Map<number, number>();
  const sigmaTot = new Map<number, number>();

  for (let i = 0; i < size; i++) {
    const c = node2com[i]!;
    bump(sigmaTot, c, degrees[i]!);
    if (loops[i]! > 0) bump(internal, c, loops[i]!); // self-loop is internal
    for (const [j, w] of adjacency[i]!) {
      if (j > i && node2com[j] === c) bump(internal, c, w); // each edge once
    }
  }
  return { internal, sigmaTot };
}

function identityPartition(size: number): number[] {
  return Array.from({ length: size }, (_, i) => i);
}

// --- Helpers ---

function canonicalize(labels: readonly number[]): { labels: number[]; count: number } {
  const remap = new Map<number, number>();
  let next = 0;
  const out = labels.map((l) => {
    let m = remap.get(l);
    if (m === undefined) {
      m = next++;
      remap.set(l, m);
    }
    return m;
  });
  return { labels: out, count: next };
}

/**
 * Deterministic node processing order. With a seed, apply a seeded Fisher-Yates
 * shuffle (mulberry32) so callers can explore alternative stable orders; without
 * one, natural index order.
 */
function processingOrder(size: number, seed: number | undefined): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  if (seed === undefined) return order;
  const rand = mulberry32(seed >>> 0);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
