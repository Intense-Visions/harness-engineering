import type { DashboardFeature, FeatureStatus } from '@shared/types';

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

const STATUS_COLOR: Record<FeatureStatus, string> = {
  done: '#10b981',
  'in-progress': '#3b82f6',
  planned: '#6b7280',
  blocked: '#ef4444',
  backlog: '#374151',
};

/**
 * Simple layered layout: nodes without incoming edges go in column 0,
 * their dependents in column 1, etc.
 */
function computeLayout(features: DashboardFeature[]): { nodes: Node[]; edges: [string, string][] } {
  // Build edges: blocker → blocked feature
  const edges: [string, string][] = [];
  const nameSet = new Set(features.map((f) => f.name));
  for (const f of features) {
    for (const b of f.blockedBy) {
      if (nameSet.has(b)) edges.push([b, f.name]);
    }
  }

  // Compute in-degree per node
  const inDegree = new Map<string, number>();
  for (const f of features) inDegree.set(f.name, 0);
  for (const [, to] of edges) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);

  // Assign columns (topological levels)
  const col = new Map<string, number>();
  const queue = features.filter((f) => (inDegree.get(f.name) ?? 0) === 0).map((f) => f.name);
  for (const name of queue) col.set(name, 0);

  for (const [from, to] of edges) {
    const fromCol = col.get(from) ?? 0;
    col.set(to, Math.max(col.get(to) ?? 0, fromCol + 1));
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

  return { nodes, edges };
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

  const { nodes, edges } = computeLayout(relevant);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + PADDING;
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + PADDING;

  return (
    <div>
      <p className="mb-2 text-xs text-gray-500">Blocker relationships (arrow: blocker → blocked)</p>
      <svg width={maxX} height={maxY} className="overflow-visible">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#6b7280" />
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
              stroke="#6b7280"
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
              fill="#1f2937"
              stroke={STATUS_COLOR[n.status] ?? '#6b7280'}
              strokeWidth={1.5}
            />
            <text
              x={n.x + NODE_W / 2}
              y={n.y + NODE_H / 2}
              dominantBaseline="middle"
              textAnchor="middle"
              fontSize={10}
              fill="#d1d5db"
            >
              {n.id.length > 18 ? n.id.slice(0, 17) + '…' : n.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
