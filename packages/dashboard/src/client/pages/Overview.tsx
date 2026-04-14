import { useSSE } from '../hooks/useSSE';
import { GlowCard } from '../components/NeonAI/GlowCard';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, Zap, Layers, Share2, Compass } from 'lucide-react';
import type { OverviewData } from '@shared/types';
import { SSE_ENDPOINT } from '@shared/constants';
import {
  isRoadmapData,
  isHealthData,
  isGraphData,
  isSecurityData,
  isPerfData,
  isArchData,
} from '../utils/typeGuards';

function SectionHeader({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="rounded-lg bg-primary-500/10 p-1.5 text-primary-500">
        <Icon size={16} />
      </div>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-muted">{title}</h2>
    </div>
  );
}

function SectionUnavailable({ data }: { data: unknown }) {
  return (
    <div className="rounded-xl border border-neutral-border bg-neutral-surface/20 p-6 text-center backdrop-blur-sm">
      <p className="text-sm text-neutral-muted">
        {data && typeof data === 'object' && 'error' in data
          ? (data as { error: string }).error
          : 'Module diagnostics unavailable'}
      </p>
    </div>
  );
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function RoadmapSection({ roadmap }: { roadmap: unknown }) {
  return (
    <motion.section variants={item}>
      <SectionHeader title="Strategic Roadmap" icon={Compass} />
      {roadmap && isRoadmapData(roadmap) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <GlowCard delay={0.1}>
            <Stat label="Total" value={roadmap.totalFeatures} />
          </GlowCard>
          <GlowCard delay={0.2}>
            <Stat label="Done" value={roadmap.totalDone} color="text-emerald-400" />
          </GlowCard>
          <GlowCard delay={0.3}>
            <Stat label="In Progress" value={roadmap.totalInProgress} color="text-primary-500" />
          </GlowCard>
          <GlowCard delay={0.4}>
            <Stat label="Planned" value={roadmap.totalPlanned} />
          </GlowCard>
          <GlowCard delay={0.5}>
            <Stat
              label="Blocked"
              value={roadmap.totalBlocked}
              color={roadmap.totalBlocked > 0 ? 'text-red-400' : 'text-neutral-text'}
            />
          </GlowCard>
        </div>
      ) : (
        <SectionUnavailable data={roadmap} />
      )}
    </motion.section>
  );
}

function HealthSection({ health }: { health: unknown }) {
  return (
    <motion.section variants={item}>
      <SectionHeader title="Codebase Health" icon={Activity} />
      {health && isHealthData(health) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <GlowCard delay={0.1}>
            <Stat
              label="Total Issues"
              value={health.totalIssues}
              color={health.totalIssues > 0 ? 'text-amber-400' : 'text-emerald-400'}
            />
          </GlowCard>
          <GlowCard delay={0.2}>
            <Stat
              label="Errors"
              value={health.errors}
              color={health.errors > 0 ? 'text-red-400' : 'text-neutral-text'}
            />
          </GlowCard>
          <GlowCard delay={0.3}>
            <Stat
              label="Warnings"
              value={health.warnings}
              color={health.warnings > 0 ? 'text-amber-400' : 'text-neutral-text'}
            />
          </GlowCard>
          <GlowCard delay={0.4}>
            <Stat
              label="Auto-fixable"
              value={health.fixableCount}
              sub={`${health.durationMs}ms scan`}
            />
          </GlowCard>
        </div>
      ) : (
        <SectionUnavailable data={health} />
      )}
    </motion.section>
  );
}

function Stat({
  label,
  value,
  color = 'text-neutral-text',
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
        {label}
      </span>
      <span className={`text-2xl font-bold tracking-tight ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-neutral-muted font-mono">{sub}</span>}
    </div>
  );
}

export function Overview() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const { data: checksData } = useSSE(SSE_ENDPOINT, 'checks');

  const roadmap = data ? data.roadmap : null;
  const health = data ? data.health : null;
  const graph = data ? data.graph : null;
  const security = checksData ? checksData.security : null;
  const perf = checksData ? checksData.perf : null;
  const arch = checksData ? checksData.arch : null;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto">
      <div className="mb-10 flex items-end justify-between border-b border-neutral-border pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter">Command Center</h1>
          <p className="text-sm text-neutral-muted mt-1">
            Real-time telemetry and project intelligence.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
          <div className="h-8 w-px bg-neutral-border mx-2" />
          <ActionButton
            url="/api/actions/validate"
            label="Initialize Scan"
            loadingLabel="Scanning..."
          />
        </div>
      </div>

      {!data && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-muted">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="mb-4"
          >
            <Zap size={32} />
          </motion.div>
          <p className="text-sm font-mono tracking-widest uppercase">
            Connecting to Neural Link...
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-12 pb-20">
          <RoadmapSection roadmap={roadmap} />
          <HealthSection health={health} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <motion.section variants={item}>
              <SectionHeader title="Security Audit" icon={ShieldCheck} />
              {security && isSecurityData(security) ? (
                <div className="grid grid-cols-2 gap-4">
                  <GlowCard delay={0.1}>
                    <Stat
                      label="System Trust"
                      value={security.valid ? 'Verified' : 'Compromised'}
                      color={security.valid ? 'text-emerald-400' : 'text-red-400'}
                    />
                  </GlowCard>
                  <GlowCard delay={0.2}>
                    <Stat
                      label="Threats"
                      value={security.stats.errorCount}
                      color={security.stats.errorCount > 0 ? 'text-red-400' : 'text-neutral-text'}
                    />
                  </GlowCard>
                </div>
              ) : (
                <SectionUnavailable data={security} />
              )}
            </motion.section>

            <motion.section variants={item}>
              <SectionHeader title="System Perf" icon={Zap} />
              {perf && isPerfData(perf) ? (
                <div className="grid grid-cols-2 gap-4">
                  <GlowCard delay={0.1}>
                    <Stat
                      label="Efficiency"
                      value={perf.valid ? 'Optimal' : 'Degraded'}
                      color={perf.valid ? 'text-emerald-400' : 'text-amber-400'}
                    />
                  </GlowCard>
                  <GlowCard delay={0.2}>
                    <Stat
                      label="Anomalies"
                      value={perf.stats.violationCount}
                      color={perf.stats.violationCount > 0 ? 'text-red-400' : 'text-neutral-text'}
                    />
                  </GlowCard>
                </div>
              ) : (
                <SectionUnavailable data={perf} />
              )}
            </motion.section>
          </div>

          <motion.section variants={item}>
            <SectionHeader title="Knowledge Mesh" icon={Share2} />
            {graph && isGraphData(graph) ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <GlowCard delay={0.1}>
                  <Stat label="Neurons" value={graph.nodeCount} />
                </GlowCard>
                <GlowCard delay={0.2}>
                  <Stat label="Synapses" value={graph.edgeCount} />
                </GlowCard>
                <GlowCard delay={0.3} className="lg:col-span-2">
                  <Stat
                    label="Topology"
                    value={`${graph.nodesByType.length} Types`}
                    sub={graph.nodesByType
                      .map((n) => `${n.type}: ${n.count}`)
                      .slice(0, 3)
                      .join(' · ')}
                  />
                </GlowCard>
              </div>
            ) : (
              <SectionUnavailable data={graph} />
            )}
          </motion.section>
        </div>
      )}
    </motion.div>
  );
}
