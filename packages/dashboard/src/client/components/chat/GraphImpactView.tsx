import { useState } from 'react';
import { motion } from 'framer-motion';

interface GraphNode {
  id?: string;
  type?: string;
  name?: string;
  path?: string;
}

interface RiskNode extends GraphNode {
  cumulativeProbability?: number;
  probability?: number;
  depth?: number;
}

interface ImpactStats {
  nodesVisited?: number;
  edgesTraversed?: number;
  maxDepthReached?: number;
}

export type GraphImpactPayload =
  | {
      kind: 'impact';
      targetNodeId?: string;
      mode?: 'summary' | 'detailed';
      impactCounts?: { tests?: number; docs?: number; code?: number; other?: number };
      impact?: {
        tests?: GraphNode[];
        docs?: GraphNode[];
        code?: GraphNode[];
        other?: GraphNode[];
      };
      highestRiskItems?: GraphNode[];
      stats?: ImpactStats;
    }
  | {
      kind: 'blast';
      sourceNodeId?: string;
      sourceName?: string;
      mode?: 'compact' | 'detailed';
      topRisks?: RiskNode[];
      flatSummary?: RiskNode[];
      summary?: { totalAffected?: number; maxDepth?: number; meanProbability?: number };
    };

/** Parse a get_impact / compute_blast_radius tool result, with envelope-stripping. */
export function parseGraphImpactResult(raw: string): GraphImpactPayload | null {
  const stripped = raw.replace(/^\s*<!--\s*packed:[^>]*-->\s*/, '').trim();
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  try {
    const p = JSON.parse(stripped.slice(start)) as Record<string, unknown>;

    if (
      typeof p.targetNodeId === 'string' &&
      (typeof p.impact === 'object' || typeof p.impactCounts === 'object')
    ) {
      return { kind: 'impact', ...p } as GraphImpactPayload;
    }
    if (
      typeof p.sourceNodeId === 'string' &&
      (Array.isArray(p.topRisks) || Array.isArray(p.flatSummary))
    ) {
      return { kind: 'blast', ...p } as GraphImpactPayload;
    }
    return null;
  } catch {
    return null;
  }
}

const CATEGORY_STYLES: Record<string, { color: string; label: string }> = {
  tests: { color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5', label: 'Tests' },
  code: { color: 'text-primary-400 border-primary-400/30 bg-primary-400/5', label: 'Code' },
  docs: { color: 'text-secondary-400 border-secondary-400/30 bg-secondary-400/5', label: 'Docs' },
  other: { color: 'text-neutral-muted border-neutral-border bg-neutral-bg/30', label: 'Other' },
};

function NodeChip({ node }: { node: GraphNode }) {
  const label = node.name || node.path || node.id || '?';
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-neutral-border/60 bg-neutral-bg/40 px-1.5 py-0.5 font-mono text-[10px] text-neutral-text/90 truncate max-w-full"
      title={node.path || node.id}
    >
      {node.type && <span className="text-neutral-muted/60">{node.type}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}

function CategorySection({
  category,
  items,
  count,
}: {
  category: keyof typeof CATEGORY_STYLES;
  items?: GraphNode[];
  count: number;
}) {
  const [open, setOpen] = useState(category === 'tests' || category === 'code');
  if (count === 0) return null;
  const styles = CATEGORY_STYLES[category]!;
  const hasItems = items && items.length > 0;

  return (
    <div className="rounded border border-neutral-border/40 overflow-hidden">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${
          hasItems ? 'cursor-pointer hover:bg-white/5' : ''
        } transition-colors`}
        onClick={hasItems ? () => setOpen((v) => !v) : undefined}
      >
        {hasItems && (
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            className="text-[9px] text-neutral-muted"
          >
            &#9654;
          </motion.span>
        )}
        <span
          className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles.color}`}
        >
          {styles.label}
        </span>
        <span className="font-mono text-[11px] text-neutral-muted">{count}</span>
      </div>
      {open && hasItems && (
        <div className="border-t border-neutral-border/40 bg-neutral-bg/30 p-2 flex flex-wrap gap-1">
          {items.map((node, i) => (
            <NodeChip key={node.id ?? i} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactSubview(payload: Extract<GraphImpactPayload, { kind: 'impact' }>) {
  const counts = payload.impactCounts ?? {
    tests: payload.impact?.tests?.length ?? 0,
    code: payload.impact?.code?.length ?? 0,
    docs: payload.impact?.docs?.length ?? 0,
    other: payload.impact?.other?.length ?? 0,
  };
  const total = (counts.tests ?? 0) + (counts.code ?? 0) + (counts.docs ?? 0) + (counts.other ?? 0);

  return (
    <div className="flex flex-col gap-2 not-prose">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Impact
        </span>
        {payload.targetNodeId && (
          <span className="font-mono text-[11px] text-neutral-text/90 truncate">
            {payload.targetNodeId}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-neutral-muted/70">
          {total} affected
        </span>
        {payload.stats?.maxDepthReached != null && (
          <span className="font-mono text-[10px] text-neutral-muted/70">
            depth {payload.stats.maxDepthReached}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {(['tests', 'code', 'docs', 'other'] as const).map((cat) => {
          const items = payload.impact?.[cat];
          return items ? (
            <CategorySection key={cat} category={cat} items={items} count={counts[cat] ?? 0} />
          ) : (
            <CategorySection key={cat} category={cat} count={counts[cat] ?? 0} />
          );
        })}
      </div>
      {payload.highestRiskItems && payload.highestRiskItems.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted">
            Highest Risk
          </span>
          <div className="flex flex-wrap gap-1">
            {payload.highestRiskItems.map((node, i) => (
              <NodeChip key={node.id ?? i} node={node} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProbabilityBar({ p }: { p: number }) {
  const pct = Math.round(p * 100);
  const color = p >= 0.7 ? 'bg-red-500' : p >= 0.4 ? 'bg-yellow-500' : 'bg-primary-500';
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-neutral-bg/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-neutral-muted">{pct}%</span>
    </div>
  );
}

function BlastSubview(payload: Extract<GraphImpactPayload, { kind: 'blast' }>) {
  const risks = payload.topRisks ?? payload.flatSummary ?? [];

  return (
    <div className="flex flex-col gap-2 not-prose">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Blast Radius
        </span>
        {payload.sourceName && (
          <span className="font-mono text-[11px] text-neutral-text/90 truncate">
            {payload.sourceName}
          </span>
        )}
        {payload.summary?.totalAffected != null && (
          <span className="ml-auto font-mono text-[10px] text-neutral-muted/70">
            {payload.summary.totalAffected} affected
          </span>
        )}
        {payload.summary?.maxDepth != null && (
          <span className="font-mono text-[10px] text-neutral-muted/70">
            depth {payload.summary.maxDepth}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {risks.map((node, i) => {
          const p = node.cumulativeProbability ?? node.probability ?? 0;
          return (
            <div
              key={node.id ?? i}
              className="rounded border border-neutral-border/40 bg-neutral-surface/30 px-3 py-1.5 flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-bold text-neutral-text truncate">
                    {node.name || node.path || node.id}
                  </span>
                  {node.type && (
                    <span className="text-[9px] text-neutral-muted/70">{node.type}</span>
                  )}
                  {node.depth != null && (
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-neutral-muted/60">
                      d{node.depth}
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <ProbabilityBar p={p} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GraphImpactView({ payload }: { payload: GraphImpactPayload }) {
  if (payload.kind === 'impact') return <ImpactSubview {...payload} />;
  return <BlastSubview {...payload} />;
}
