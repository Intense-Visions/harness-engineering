import { motion } from 'framer-motion';
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
 */
function computeLayout(features: DashboardFeature[]): {
  nodes: Node[];
  edges: [string, string][];
  cycleNodes: string[];
} {
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
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const visited = new Set(queue);
  const cycleNodes = features.filter((f) => !visited.has(f.name)).map((f) => f.name);

  if (cycleNodes.length > 0) {
    const maxCol = Math.max(0, ...Array.from(col.values()));
    for (const name of cycleNodes) col.set(name, maxCol + 1);
  }

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
    <div className="relative group">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
          Relationship Topology
        </p>
        {cycleNodes.length > 0 && (
          <span className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20 animate-pulse">
            Cycles Detected: {cycleNodes.length}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-neutral-bg/30 p-6 backdrop-blur-md">
        <svg width={maxX} height={maxY} className="overflow-visible">
          <defs>
            <filter id="neon-glow-small" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#4f46e5" />
            </marker>
          </defs>

          {/* Edges with drawing animation */}
          {edges.map(([from, to], i) => {
            const f = nodeMap.get(from);
            const t = nodeMap.get(to);
            if (!f || !t) return null;
            const x1 = f.x + NODE_W;
            const y1 = f.y + NODE_H / 2;
            const x2 = t.x;
            const y2 = t.y + NODE_H / 2;
            return (
              <motion.line
                key={`${from}-${to}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, delay: i * 0.05 }}
                x1={x1}
                y1={y1}
                x2={x2 - 4}
                y2={y2}
                className="stroke-primary-500/20"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Nodes with Entrance effect */}
          {nodes.map((n, i) => (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, scale: 0.9, y: n.y + 10 }}
              animate={{ opacity: 1, scale: 1, y: n.y }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              whileHover={{ scale: 1.05, filter: 'url(#neon-glow-small)' }}
              className="cursor-pointer"
            >
              <rect
                x={n.x}
                y={0}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className="fill-neutral-surface/80 stroke-neutral-border"
                strokeWidth={1}
              />
              <motion.rect
                x={n.x}
                y={0}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className="fill-none"
                stroke={STATUS_COLOR[n.status] ?? '#27272a'}
                strokeWidth={1.5}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: i * 0.05 }}
              />
              <text
                x={n.x + NODE_W / 2}
                y={NODE_H / 2}
                dominantBaseline="middle"
                textAnchor="middle"
                className="text-[10px] font-bold tracking-tight fill-neutral-text pointer-events-none"
              >
                {n.id.length > 18 ? n.id.slice(0, 17) + '…' : n.id}
              </text>
            </motion.g>
          ))}
        </svg>
      </div>
    </div>
  );
}
