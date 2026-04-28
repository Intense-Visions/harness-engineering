import { useSSE } from '../hooks/useSSE';
import { GlowCard } from '../components/NeonAI/GlowCard';
import { ScrambleText } from '../components/NeonAI/ScrambleText';
import { StaleIndicator } from '../components/StaleIndicator';
import { ActionButton } from '../components/ActionButton';
import { motion } from 'framer-motion';
import { useEffect } from 'react';
import {
  AlertTriangle,
  Ban,
  ShieldAlert,
  Zap,
  Activity,
  Compass,
  ShieldCheck,
  Share2,
  CheckCircle2,
} from 'lucide-react';
import { SSE_ENDPOINT } from '@shared/constants';
import { useProjectPulse } from '../hooks/useProjectPulse';
import { NeuralOrganism } from '../components/chat/NeuralOrganism';
import {
  isRoadmapData,
  isHealthData,
  isGraphData,
  isSecurityData,
  isPerfData,
} from '../utils/typeGuards';
import { Link } from 'react-router';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1 },
};

interface Alert {
  id: string;
  icon: typeof AlertTriangle;
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
  borderColor: string;
  link: string;
}

function buildAlerts(roadmap: unknown, health: unknown, security: unknown, perf: unknown): Alert[] {
  const alerts: Alert[] = [];

  if (isHealthData(health) && health.errors > 0) {
    alerts.push({
      id: 'health-errors',
      icon: AlertTriangle,
      label: 'Health Errors',
      value: health.errors,
      color: 'text-red-400',
      bgColor: 'bg-red-500/5',
      borderColor: 'border-red-500/20',
      link: '/intelligence/health',
    });
  }

  if (isRoadmapData(roadmap) && roadmap.totalBlocked > 0) {
    alerts.push({
      id: 'blocked-features',
      icon: Ban,
      label: 'Blocked Features',
      value: roadmap.totalBlocked,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/20',
      link: '/roadmap',
    });
  }

  if (isSecurityData(security) && security.stats.errorCount > 0) {
    alerts.push({
      id: 'security-threats',
      icon: ShieldAlert,
      label: 'Security Threats',
      value: security.stats.errorCount,
      color: 'text-red-400',
      bgColor: 'bg-red-500/5',
      borderColor: 'border-red-500/20',
      link: '/intelligence/health',
    });
  }

  if (isPerfData(perf) && perf.stats.violationCount > 0) {
    alerts.push({
      id: 'perf-anomalies',
      icon: Zap,
      label: 'Perf Violations',
      value: perf.stats.violationCount,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/20',
      link: '/intelligence/health',
    });
  }

  return alerts;
}

function AlertCard({ alert }: { alert: Alert }) {
  const Icon = alert.icon;
  return (
    <Link to={alert.link}>
      <GlowCard uid={`ALERT_${alert.id}`} delay={0.1} className="h-full">
        <div className={`flex items-center gap-4 ${alert.bgColor} rounded-lg p-1 -m-1`}>
          <div
            className={`flex-shrink-0 rounded-lg p-2 ${alert.color} ${alert.borderColor} border`}
          >
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted block">
              {alert.label}
            </span>
            <span className={`text-2xl font-black tracking-tighter ${alert.color}`}>
              {alert.value}
            </span>
          </div>
        </div>
      </GlowCard>
    </Link>
  );
}

interface StatusItem {
  icon: typeof Activity;
  label: string;
  value: string;
  healthy: boolean;
}

function StatusStrip({
  roadmap,
  health,
  security,
  perf,
  graph,
}: {
  roadmap: unknown;
  health: unknown;
  security: unknown;
  perf: unknown;
  graph: unknown;
}) {
  const items: StatusItem[] = [];

  if (isRoadmapData(roadmap)) {
    const pct =
      roadmap.totalFeatures > 0 ? Math.round((roadmap.totalDone / roadmap.totalFeatures) * 100) : 0;
    items.push({
      icon: Compass,
      label: 'Roadmap',
      value: `${pct}% done · ${roadmap.totalInProgress} active`,
      healthy: roadmap.totalBlocked === 0,
    });
  }

  if (isHealthData(health)) {
    items.push({
      icon: Activity,
      label: 'Health',
      value:
        health.totalIssues === 0
          ? 'Clean'
          : `${health.totalIssues} issues · ${health.fixableCount} fixable`,
      healthy: health.totalIssues === 0,
    });
  }

  if (isSecurityData(security)) {
    items.push({
      icon: ShieldCheck,
      label: 'Security',
      value: security.valid ? 'Verified' : `${security.stats.errorCount} threats`,
      healthy: security.valid,
    });
  }

  if (isPerfData(perf)) {
    items.push({
      icon: Zap,
      label: 'Performance',
      value: perf.valid ? 'Optimal' : `${perf.stats.violationCount} violations`,
      healthy: perf.valid,
    });
  }

  if (isGraphData(graph)) {
    items.push({
      icon: Share2,
      label: 'Knowledge',
      value: `${graph.nodeCount} nodes · ${graph.edgeCount} edges`,
      healthy: true,
    });
  }

  if (items.length === 0) return null;

  return (
    <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-neutral-surface/20 px-4 py-3 backdrop-blur-sm"
          >
            <div
              className={`rounded-md p-1.5 ${s.healthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}
            >
              <Icon size={14} />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-muted block">
                {s.label}
              </span>
              <span className="text-xs font-semibold text-neutral-text truncate block">
                {s.value}
              </span>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

export function Overview() {
  const { data, lastUpdated, stale, error } = useSSE(SSE_ENDPOINT, 'overview');
  const { data: checksData } = useSSE(SSE_ENDPOINT, 'checks');
  const { setPulse } = useProjectPulse();

  const roadmap = data ? data.roadmap : null;
  const health = data ? data.health : null;
  const graph = data ? data.graph : null;
  const security = checksData ? checksData.security : null;
  const perf = checksData ? checksData.perf : null;

  const alerts = buildAlerts(roadmap, health, security, perf);

  useEffect(() => {
    if (health && isHealthData(health)) {
      const issues = health.totalIssues || 0;
      const stress = Math.min(issues / 20, 1);
      setPulse({
        stressLevel: stress,
        isHealthy: issues === 0,
        totalIssues: issues,
      });
    }
  }, [health, setPulse]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-10 flex items-start justify-between border-b border-neutral-border pb-8">
        <div className="flex items-start gap-8">
          <motion.div
            className="relative flex-shrink-0 mt-1"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="absolute inset-0 -m-6 rounded-full pointer-events-none"
              animate={{
                opacity: [0.04, 0.09, 0.05, 0.07, 0.04],
                scale: [1, 1.08, 1.02, 1.06, 1],
              }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)',
                filter: 'blur(14px)',
              }}
            />
            <div
              className="relative rounded-full p-3"
              style={{
                background:
                  'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 50%, transparent 70%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.03)',
              }}
            >
              <NeuralOrganism size={88} />
            </div>
          </motion.div>

          <div className="pt-1">
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
        </div>
        <div className="flex items-center gap-4 pt-3">
          <StaleIndicator lastUpdated={lastUpdated} stale={stale} error={error} />
          <div className="h-10 w-px bg-neutral-border mx-2" />
          <ActionButton
            url="/api/actions/validate"
            label="Initialize Tactical Scan"
            loadingLabel="Scanning Neural Mesh..."
          />
        </div>
      </div>

      {/* Loading state */}
      {!data && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-muted">
          <motion.p
            className="text-sm font-mono tracking-widest uppercase"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
          >
            <ScrambleText text="Decrypting Telemetry..." />
          </motion.p>
        </div>
      )}

      {data && (
        <div className="space-y-8 pb-20">
          {/* Alerts — only shown when there are actionable items */}
          {alerts.length > 0 && (
            <motion.section variants={item}>
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-lg bg-red-500/10 p-1.5 text-red-400">
                  <AlertTriangle size={14} />
                </div>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-muted">
                  Requires Attention
                </h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {alerts.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            </motion.section>
          )}

          {/* All-clear banner when no alerts */}
          {alerts.length === 0 && (
            <motion.div
              variants={item}
              className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-4"
            >
              <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
              <div>
                <span className="text-sm font-bold text-emerald-400">All Systems Nominal</span>
                <span className="text-xs text-neutral-muted ml-3">
                  No errors, blockers, threats, or violations detected.
                </span>
              </div>
            </motion.div>
          )}

          {/* Status strip — compact domain health at a glance */}
          <StatusStrip
            roadmap={roadmap}
            health={health}
            security={security}
            perf={perf}
            graph={graph}
          />
        </div>
      )}
    </motion.div>
  );
}
