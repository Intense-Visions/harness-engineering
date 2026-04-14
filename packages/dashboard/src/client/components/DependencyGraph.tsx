import type { DashboardFeature, FeatureStatus } from '@shared/types';
import { STATUS_COLOR } from '../utils/statusColors';

interface Props {
  features: DashboardFeature[];
}

interface Node {
  id: string;
  x: number;
  y: number;
  status: FeatureStatus;
}

const NODE_W = 140;
const NODE_H = 32;
const COL_GAP = 180;
const ROW_GAP = 56;
const PADDING = 24;

/**
 * Layered layout using Kahn's algorithm for proper topological ordering.
 * Detects cycles and reports nodes involved.
 */
function computeLayout(features: DashboardFeature[]): {
  nodes: Node[];
  edges: [string, string][];
  cycleNodes: string[];
} {
  // Build edges: blocker → blocked feature
  const edges: [string, string][] = [];
  const nameSet = new Set(features.map((f) => f.name));
  const adjacency = new Map<string, string[]>();
  for (const f of features) adjacency.set(f.name, []);
  for (const f of features) {
    for (const b of f.blockedBy) {
      if (nameSet.has(b)) {
        edges.push([b, f.name]);
        adjacency.get(b)!.push(f.name);
      }
    }
  }

  // Kahn's algorithm: BFS from nodes with inDegree 0
  const inDegree = new Map<string, number>();
  for (const f of features) inDegree.set(f.name, 0);
  for (const [, to] of edges) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);

  const col = new Map<string, number>();
  const queue: string[] = [];
  for (const f of features) {
    if ((inDegree.get(f.name) ?? 0) === 0) {
      queue.push(f.name);
      col.set(f.name, 0);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentCol = col.get(current) ?? 0;
    for (const neighbor of adjacency.get(current)!) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      col.set(neighbor, Math.max(col.get(neighbor) ?? 0, currentCol + 1));
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Nodes never added to queue are in a cycle
  const visited = new Set(queue);
  const cycleNodes = features.filter((f) => !visited.has(f.name)).map((f) => f.name);

  // Place cycle nodes in a fallback column (max + 1)
  if (cycleNodes.length > 0) {
    const maxCol = Math.max(0, ...Array.from(col.values()));
    for (const name of cycleNodes) {
      col.set(name, maxCol + 1);
    }
  }

  // Assign rows within each column
  const rowCount = new Map<number, number>();
  const nodes: Node[] = features.map((f) => {
    const c = col.get(f.name) ?? 0;
    const r = rowCount.get(c) ?? 0;
    rowCount.set(c, r + 1);
    return {
      id: f.name,
      x: PADDING + c * COL_GAP,
      y: PADDING + r * ROW_GAP,
      status: f.status,
    };
  });

  return { nodes, edges, cycleNodes };
}

export function DependencyGraph({ features }: Props) {
  // Only include features that have or are blockers
  const blocking = new Set<string>();
  const blocked = new Set<string>();
  for (const f of features) {
    for (const b of f.blockedBy) {
      blocking.add(b);
      blocked.add(f.name);
    }
  }

  const relevant = features.filter((f) => blocking.has(f.name) || blocked.has(f.name));
  if (relevant.length === 0) return null;

  const { nodes, edges, cycleNodes } = computeLayout(relevant);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + PADDING;
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + PADDING;

  return (
    <div>
      <p className="mb-2 text-xs text-neutral-muted">
        Blocker relationships (arrow: blocker → blocked)
      </p>
      {cycleNodes.length > 0 && (
        <p className="mb-2 text-xs text-secondary-400">
          Cyclic dependencies detected: {cycleNodes.join(', ')}
        </p>
      )}
      <svg width={maxX} height={maxY} className="overflow-visible">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#27272a" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map(([from, to]) => {
          const f = nodeMap.get(from);
          const t = nodeMap.get(to);
          if (!f || !t) return null;
          const x1 = f.x + NODE_W;
          const y1 = f.y + NODE_H / 2;
          const x2 = t.x;
          const y2 = t.y + NODE_H / 2;
          return (
            <line
              key={`${from}-${to}`}
              x1={x1}
              y1={y1}
              x2={x2 - 2}
              y2={y2}
              stroke="#27272a"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={NODE_W}
              height={NODE_H}
              rx={4}
              fill="#18181b"
              stroke={STATUS_COLOR[n.status] ?? '#27272a'}
              strokeWidth={1.5}
            />
            <text
              x={n.x + NODE_W / 2}
              y={n.y + NODE_H / 2}
              dominantBaseline="middle"
              textAnchor="middle"
              fontSize={10}
              fill="#fafafa"
            >
              {n.id.length > 18 ? n.id.slice(0, 17) + '…' : n.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
