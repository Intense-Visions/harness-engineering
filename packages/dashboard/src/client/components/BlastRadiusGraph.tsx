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
      <div className="flex h-32 items-center justify-center rounded border border-neutral-border bg-neutral-bg">
        <p className="text-sm text-neutral-muted">No affected nodes</p>
      </div>
    );
  }

  const nodeMap = new Map(layout.nodes.map((n) => [n.nodeId, n]));
  const depthLabels = data.layers.map((l) => l.depth);

  return (
    <div>
      <SummaryBar data={data} />
      <div className="overflow-x-auto rounded border border-neutral-border bg-neutral-bg p-4">
        <svg width={layout.width} height={layout.height} className="overflow-visible">
          <defs>
            <marker
              id="blast-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="#27272a" />
            </marker>
          </defs>

          {/* Depth column labels */}
          <text
            x={SOURCE_COL_X + NODE_W / 2}
            y={PADDING.top - 14}
            textAnchor="middle"
            fontSize={10}
            fill="#71717a"
          >
            Source
          </text>
          {depthLabels.map((d) => {
            const colX = SOURCE_COL_X + d * COL_GAP;
            return (
              <text
                key={d}
                x={colX + NODE_W / 2}
                y={PADDING.top - 14}
                textAnchor="middle"
                fontSize={10}
                fill="#71717a"
              >
                Depth {d}
              </text>
            );
          })}

          {/* Edges */}
          {layout.edges.map((edge) => {
            const from = nodeMap.get(edge.fromId);
            const to = nodeMap.get(edge.toId);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            return (
              <line
                key={`${edge.fromId}-${edge.toId}`}
                x1={x1}
                y1={y1}
                x2={x2 - 2}
                y2={y2}
                stroke="#27272a"
                strokeWidth={1}
                strokeOpacity={clampOpacity(to.probability)}
                markerEnd="url(#blast-arrow)"
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((n) => (
            <g key={n.nodeId} opacity={clampOpacity(n.probability)}>
              <rect
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={NODE_H}
                rx={4}
                fill="#18181b"
                stroke={RISK_COLORS[n.risk]}
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
                {n.name.length > 16 ? n.name.slice(0, 15) + '\u2026' : n.name}
              </text>
              <text
                x={n.x + NODE_W - 4}
                y={n.y + NODE_H - 4}
                textAnchor="end"
                fontSize={8}
                fill="#71717a"
              >
                {n.type === 'source' ? '' : `${(n.probability * 100).toFixed(0)}%`}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
