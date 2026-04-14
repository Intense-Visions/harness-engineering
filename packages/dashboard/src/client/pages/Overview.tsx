import { useSSE } from '../hooks/useSSE';
import { GlowCard } from '../components/NeonAI/GlowCard';
import { ScrambleText } from '../components/NeonAI/ScrambleText';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import { motion, animate } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Activity, ShieldCheck, Zap, Share2, Compass } from 'lucide-react';
import { SSE_ENDPOINT } from '@shared/constants';
import {
  isRoadmapData,
  isHealthData,
  isGraphData,
  isSecurityData,
  isPerfData,
} from '../utils/typeGuards';

function SectionHeader({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="rounded-lg bg-primary-500/10 p-1.5 text-primary-500 shadow-[0_0_10px_var(--color-primary-500)]">
        <Icon size={16} />
      </div>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-muted">
        <ScrambleText text={title} />
      </h2>
    </div>
  );
}

function SectionUnavailable({ data }: { data: unknown }) {
  return (
    <div className="rounded-xl border border-neutral-border bg-neutral-surface/20 p-6 text-center backdrop-blur-sm">
      <p className="text-sm text-neutral-muted font-mono">
        {data && typeof data === 'object' && 'error' in data
          ? `ERR: ${(data as { error: string }).error}`
          : 'MODULE_OFFLINE'}
      </p>
    </div>
  );
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1 },
};

function RoadmapSection({ roadmap }: { roadmap: unknown }) {
  return (
    <motion.section variants={item}>
      <SectionHeader title="Strategic Roadmap" icon={Compass} />
      {roadmap && isRoadmapData(roadmap) ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <GlowCard
            delay={0.1}
            className="col-span-2 lg:col-span-2 lg:row-span-2 flex flex-col justify-center"
          >
            <Stat label="Total Features" value={roadmap.totalFeatures} size="text-5xl" />
          </GlowCard>
          <GlowCard delay={0.2} className="col-span-1 lg:col-span-2">
            <Stat label="Done" value={roadmap.totalDone} color="text-emerald-400" />
          </GlowCard>
          <GlowCard delay={0.3} className="col-span-1 lg:col-span-2">
            <Stat label="In Progress" value={roadmap.totalInProgress} color="text-primary-500" />
          </GlowCard>
          <GlowCard delay={0.4} className="col-span-1 lg:col-span-2">
            <Stat label="Planned" value={roadmap.totalPlanned} />
          </GlowCard>
          <GlowCard delay={0.5} className="col-span-1 lg:col-span-2">
            <Stat
              label="Blocked"
              value={roadmap.totalBlocked}
              color={roadmap.totalBlocked > 0 ? 'text-red-400 animate-pulse' : 'text-neutral-text'}
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <GlowCard
            delay={0.1}
            className="col-span-2 lg:col-span-2 lg:row-span-2 flex flex-col justify-center bg-gradient-to-br from-neutral-surface/40 to-primary-500/5"
          >
            <Stat
              label="Total Issues"
              value={health.totalIssues}
              color={health.totalIssues > 0 ? 'text-amber-400' : 'text-emerald-400'}
              size="text-6xl"
            />
          </GlowCard>
          <GlowCard delay={0.2} className="col-span-1 lg:col-span-2">
            <Stat
              label="Errors"
              value={health.errors}
              color={health.errors > 0 ? 'text-red-400' : 'text-neutral-text'}
            />
          </GlowCard>
          <GlowCard delay={0.3} className="col-span-1">
            <Stat
              label="Warnings"
              value={health.warnings}
              color={health.warnings > 0 ? 'text-amber-400' : 'text-neutral-text'}
            />
          </GlowCard>
          <GlowCard delay={0.4} className="col-span-2 lg:col-span-1">
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
  size = 'text-3xl',
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  size?: string;
  sub?: string;
}) {
  const [displayValue, setDisplayValue] = useState<string | number>(
    typeof value === 'number' ? 0 : value
  );

  useEffect(() => {
    if (typeof value === 'number') {
      const controls = animate(0, value, {
        duration: 1.5,
        ease: 'circOut',
        onUpdate: (latest) => setDisplayValue(Math.floor(latest)),
      });
      return () => controls.stop();
    } else {
      setDisplayValue(value);
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
        {label}
      </span>
      <motion.span
        key={value}
        initial={{ opacity: 0, filter: 'blur(8px)', y: 10 }}
        animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
        transition={{ duration: 0.6 }}
        className={`${size} font-black tracking-tighter ${color}`}
      >
        {displayValue}
      </motion.span>
      {sub && (
        <span className="text-[10px] text-neutral-muted font-mono mt-1 border-t border-neutral-border pt-1 inline-block">
          {sub}
        </span>
      )}
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

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto">
      <div className="mb-10 flex items-end justify-between border-b border-neutral-border pb-8">
        <div>
          <h1 className="text-5xl font-black tracking-tighter text-gradient-neon pb-1">
            <ScrambleText text="Command Center" />
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary-500/10 border border-primary-500/20">
              <div className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse shadow-[0_0_8px_var(--color-primary-500)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary-500">
                Live Telemetry
              </span>
            </div>
            <p className="text-sm text-neutral-muted">
              Neural link established. Monitoring project intelligence.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
          <div className="h-10 w-px bg-neutral-border mx-2" />
          <ActionButton
            url="/api/actions/validate"
            label="Initialize Tactical Scan"
            loadingLabel="Scanning Neural Mesh..."
          />
        </div>
      </div>

      {!data && !error && (
        <div className="flex flex-col items-center justify-center py-32 text-neutral-muted relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.1),transparent_50%)] animate-pulse" />
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.1, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="mb-6 relative z-10"
          >
            <Zap
              size={48}
              className="text-primary-500 drop-shadow-[0_0_15px_var(--color-primary-500)]"
            />
          </motion.div>
          <p className="text-sm font-mono tracking-widest uppercase relative z-10">
            <ScrambleText text="Decrypting Telemetry..." />
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-12 pb-20">
          <RoadmapSection roadmap={roadmap} />
          <HealthSection health={health} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <motion.section variants={item} className="h-full flex flex-col">
              <SectionHeader title="Security Audit" icon={ShieldCheck} />
              {security && isSecurityData(security) ? (
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <GlowCard delay={0.1} className="h-full">
                    <Stat
                      label="System Trust"
                      value={security.valid ? 'Verified' : 'Compromised'}
                      color={
                        security.valid ? 'text-emerald-400 text-shadow-emerald' : 'text-red-400'
                      }
                    />
                  </GlowCard>
                  <GlowCard delay={0.2} className="h-full">
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

            <motion.section variants={item} className="h-full flex flex-col">
              <SectionHeader title="System Perf" icon={Zap} />
              {perf && isPerfData(perf) ? (
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <GlowCard delay={0.1} className="h-full">
                    <Stat
                      label="Efficiency"
                      value={perf.valid ? 'Optimal' : 'Degraded'}
                      color={perf.valid ? 'text-emerald-400' : 'text-amber-400'}
                    />
                  </GlowCard>
                  <GlowCard delay={0.2} className="h-full">
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
                <GlowCard delay={0.1} className="col-span-2 lg:col-span-1">
                  <Stat label="Neurons" value={graph.nodeCount} />
                </GlowCard>
                <GlowCard delay={0.2} className="col-span-2 lg:col-span-1">
                  <Stat label="Synapses" value={graph.edgeCount} />
                </GlowCard>
                <GlowCard delay={0.3} className="col-span-2 lg:col-span-2">
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
