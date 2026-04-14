import { motion } from 'framer-motion';
import type { BlastRadiusData, BlastRadiusNode } from '@shared/types';

// --- Layout constants ---
const NODE_W = 130;
const NODE_H = 30;
const COL_GAP = 180;
const ROW_GAP = 44;
const PADDING = { top: 40, right: 24, bottom: 24, left: 24 };
const SOURCE_COL_X = PADDING.left;

// --- Risk classification ---
export const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#71717a',
} as const;

export type RiskLevel = keyof typeof RISK_COLORS;

export function classifyRisk(probability: number): RiskLevel {
  if (probability > 0.7) return 'high';
  if (probability >= 0.3) return 'medium';
  return 'low';
}

export function clampOpacity(probability: number): number {
  return Math.max(0.15, Math.min(1, probability));
}

// --- Layout computation ---
export interface LayoutNode {
  nodeId: string;
  name: string;
  type: string;
  probability: number;
  parentId: string;
  risk: RiskLevel;
  x: number;
  y: number;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  sourceNode: LayoutNode;
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export function computeBlastRadiusLayout(data: BlastRadiusData): GraphLayout | null {
  if (data.layers.length === 0) return null;

  const allNodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // Source node at column 0
  const sourceNode: LayoutNode = {
    nodeId: data.sourceNodeId,
    name: data.sourceName,
    type: 'source',
    probability: 1.0,
    parentId: '',
    risk: 'high',
    x: SOURCE_COL_X,
    y: PADDING.top,
  };
  allNodes.push(sourceNode);

  // Position layer nodes in columns
  for (const layer of data.layers) {
    const colX = SOURCE_COL_X + layer.depth * COL_GAP;
    layer.nodes.forEach((node: BlastRadiusNode, rowIdx: number) => {
      const layoutNode: LayoutNode = {
        nodeId: node.nodeId,
        name: node.name,
        type: node.type,
        probability: node.probability,
        parentId: node.parentId,
        risk: classifyRisk(node.probability),
        x: colX,
        y: PADDING.top + rowIdx * ROW_GAP,
      };
      allNodes.push(layoutNode);
      edges.push({ fromId: node.parentId, toId: node.nodeId });
    });
  }

  // Compute SVG dimensions
  const maxX = Math.max(...allNodes.map((n) => n.x + NODE_W)) + PADDING.right;
  const maxY = Math.max(...allNodes.map((n) => n.y + NODE_H)) + PADDING.bottom;

  return { nodes: allNodes, sourceNode, edges, width: maxX, height: maxY };
}

// --- Summary bar ---
function SummaryBar({ data }: { data: BlastRadiusData }) {
  const { summary } = data;
  const badges: { label: string; count: number; color: string }[] = [
    { label: 'Total Affected', count: summary.totalAffected, color: '#fafafa' },
    { label: 'High Risk', count: summary.highRisk, color: RISK_COLORS.high },
    { label: 'Medium Risk', count: summary.mediumRisk, color: RISK_COLORS.medium },
    { label: 'Low Risk', count: summary.lowRisk, color: RISK_COLORS.low },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      {badges.map((b) => (
        <div key={b.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
          <span className="text-sm tabular-nums text-neutral-text">{b.count}</span>
          <span className="text-xs text-neutral-muted">{b.label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-neutral-muted">Max Depth:</span>
        <span className="text-sm tabular-nums text-neutral-text">{summary.maxDepth}</span>
      </div>
    </div>
  );
}

// --- Main component ---
interface BlastRadiusGraphProps {
  data: BlastRadiusData;
}

export function BlastRadiusGraph({ data }: BlastRadiusGraphProps) {
  const layout = computeBlastRadiusLayout(data);

  if (!layout) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-32 items-center justify-center rounded-2xl border border-neutral-border bg-neutral-bg/50 backdrop-blur-sm"
      >
        <p className="text-sm text-neutral-muted">No affected nodes detected</p>
      </motion.div>
    );
  }

  const nodeMap = new Map(layout.nodes.map((n) => [n.nodeId, n]));
  const depthLabels = data.layers.map((l) => l.depth);

  return (
    <div className="relative group">
      <SummaryBar data={data} />
      <div className="overflow-x-auto rounded-2xl border border-neutral-border bg-neutral-bg/30 p-6 backdrop-blur-md">
        <svg width={layout.width} height={layout.height} className="overflow-visible">
          <defs>
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <marker
              id="blast-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="#4f46e5" />
            </marker>
          </defs>

          {/* Depth column labels */}
          <motion.text
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            x={SOURCE_COL_X + NODE_W / 2}
            y={PADDING.top - 14}
            textAnchor="middle"
            className="text-[10px] font-bold uppercase tracking-widest fill-neutral-muted"
          >
            Origin
          </motion.text>
          {depthLabels.map((d) => {
            const colX = SOURCE_COL_X + d * COL_GAP;
            return (
              <motion.text
                key={d}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: d * 0.1 }}
                x={colX + NODE_W / 2}
                y={PADDING.top - 14}
                textAnchor="middle"
                className="text-[10px] font-bold uppercase tracking-widest fill-neutral-muted"
              >
                Layer {d}
              </motion.text>
            );
          })}

          {/* Edges with Path Drawing Animation */}
          {layout.edges.map((edge, i) => {
            const from = nodeMap.get(edge.fromId);
            const to = nodeMap.get(edge.toId);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            return (
              <motion.line
                key={`${edge.fromId}-${edge.toId}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: clampOpacity(to.probability) }}
                transition={{ duration: 0.8, delay: i * 0.05 }}
                x1={x1}
                y1={y1}
                x2={x2 - 4}
                y2={y2}
                strokeWidth={1.5}
                className="stroke-primary-500/30"
                markerEnd="url(#blast-arrow)"
              />
            );
          })}

          {/* Nodes with Hover/Entrance effects */}
          {layout.nodes.map((n, i) => (
            <motion.g
              key={n.nodeId}
              initial={{ opacity: 0, scale: 0.9, x: n.x - 10 }}
              animate={{ opacity: clampOpacity(n.probability), scale: 1, x: n.x }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              whileHover={{ scale: 1.05, filter: 'url(#neon-glow)' }}
              className="cursor-pointer"
            >
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className="fill-neutral-surface/80 stroke-neutral-border"
                strokeWidth={1}
              />
              <motion.rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className="fill-none"
                stroke={RISK_COLORS[n.risk]}
                strokeWidth={1.5}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: i * 0.05 }}
              />
              <text
                x={n.x + NODE_W / 2}
                y={n.y + NODE_H / 2}
                dominantBaseline="middle"
                textAnchor="middle"
                className="text-[10px] font-bold tracking-tight fill-neutral-text pointer-events-none"
              >
                {n.name.length > 16 ? n.name.slice(0, 15) + '\u2026' : n.name}
              </text>
              <text
                x={n.x + NODE_W - 6}
                y={n.y + NODE_H - 6}
                textAnchor="end"
                className="text-[8px] font-mono fill-neutral-muted pointer-events-none"
              >
                {n.type === 'source' ? 'SRC' : `${(n.probability * 100).toFixed(0)}%`}
              </text>
            </motion.g>
          ))}
        </svg>
      </div>
    </div>
  );
}
