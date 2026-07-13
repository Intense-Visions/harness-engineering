import { motion } from 'framer-motion';
import type { SELResult, CMLResult, PESLResult, Signal } from './types';

// --- Score bar ---

const BG_CLASSES: Record<string, string> = {
  'text-primary-500': 'bg-primary-500',
  'text-secondary-400': 'bg-secondary-400',
  'text-accent-500': 'bg-accent-500',
  'text-blue-400': 'bg-blue-400',
  'text-purple-400': 'bg-purple-400',
  'text-yellow-400': 'bg-yellow-400',
  'text-emerald-400': 'bg-emerald-400',
};

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  const bgClass = BG_CLASSES[color] || 'bg-gray-600';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${bgClass}`}
        />
      </div>
    </div>
  );
}

// --- Risk / route badges ---

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${RISK_COLORS[level] ?? RISK_COLORS.medium}`}
    >
      {level}
    </span>
  );
}

const ROUTE_COLORS: Record<string, string> = {
  local: 'text-emerald-400',
  human: 'text-amber-400',
  'simulation-required': 'text-purple-400',
};

// --- Small list block shared across cards ---

function BulletList({
  label,
  labelColor,
  items,
}: {
  label: string;
  labelColor: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>
        {label} ({items.length})
      </span>
      <ul className="mt-1 space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gray-400">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Result cards ---

export function SELCard({ data }: { data: SELResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-widest text-primary-500">
        Spec Enrichment (SEL)
      </h3>
      <div className="space-y-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Intent
          </span>
          <p className="mt-1 text-sm text-white">{data.intent}</p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Summary
          </span>
          <p className="mt-1 text-sm text-gray-300 leading-relaxed">{data.summary}</p>
        </div>
        {data.affectedSystems.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Affected Systems
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.affectedSystems.map((sys) => (
                <span
                  key={sys.name}
                  className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400"
                  title={`Confidence: ${Math.round(sys.confidence * 100)}% | Tests: ${sys.testCoverage} | Deps: ${sys.transitiveDeps.length}`}
                >
                  {sys.name}
                  {sys.graphNodeId && (
                    <span className="ml-1 text-blue-500/50">
                      {Math.round(sys.confidence * 100)}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BulletList label="Unknowns" labelColor="text-amber-500" items={data.unknowns} />
          <BulletList label="Ambiguities" labelColor="text-orange-500" items={data.ambiguities} />
          <BulletList label="Risk Signals" labelColor="text-red-500" items={data.riskSignals} />
        </div>
      </div>
    </motion.div>
  );
}

function BlastRadiusStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <span className="block text-lg font-bold text-white">{value}</span>
      <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

export function CMLCard({ data }: { data: CMLResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-secondary-400">
          Complexity Model (CML)
        </h3>
        <div className="flex items-center gap-2">
          <RiskBadge level={data.riskLevel} />
          <span
            className={`text-xs font-mono font-bold ${ROUTE_COLORS[data.recommendedRoute] ?? 'text-gray-400'}`}
          >
            {data.recommendedRoute}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <ScoreBar value={data.overall} label="Overall" color="text-primary-500" />
        <ScoreBar
          value={data.dimensions.structural}
          label="Structural"
          color="text-secondary-400"
        />
        <ScoreBar value={data.dimensions.semantic} label="Semantic" color="text-accent-500" />
        <ScoreBar value={data.dimensions.historical} label="Historical" color="text-yellow-400" />
        <ScoreBar value={data.confidence} label="Confidence" color="text-emerald-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-800">
        <BlastRadiusStat value={data.blastRadius.services} label="Services" />
        <BlastRadiusStat value={data.blastRadius.modules} label="Modules" />
        <BlastRadiusStat value={data.blastRadius.filesEstimated} label="Files" />
        <BlastRadiusStat value={data.blastRadius.testFilesAffected} label="Test Files" />
      </div>
      {data.reasoning.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Reasoning
          </span>
          <ul className="mt-1 space-y-0.5">
            {data.reasoning.map((r, i) => (
              <li key={i} className="text-xs text-gray-400">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function peslConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'text-emerald-400';
  if (confidence >= 0.4) return 'text-yellow-400';
  return 'text-red-400';
}

export function PESLCard({ data }: { data: PESLResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-gray-800 bg-gray-900 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Simulation (PESL)
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-gray-500 uppercase">{data.tier}</span>
          {data.abort && (
            <span className="rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
              Abort Recommended
            </span>
          )}
          <span className={`text-sm font-bold ${peslConfidenceColor(data.executionConfidence)}`}>
            {Math.round(data.executionConfidence * 100)}% confidence
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.simulatedPlan.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Simulated Plan
            </span>
            <ol className="mt-1 space-y-0.5 list-decimal list-inside">
              {data.simulatedPlan.map((step, i) => (
                <li key={i} className="text-xs text-gray-300">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
        <BulletList
          label="Predicted Failures"
          labelColor="text-red-500"
          items={data.predictedFailures}
        />
        <BulletList label="Risk Hotspots" labelColor="text-orange-500" items={data.riskHotspots} />
        <BulletList label="Test Gaps" labelColor="text-amber-500" items={data.testGaps} />
      </div>
      {data.recommendedChanges.length > 0 && (
        <div className="pt-2 border-t border-gray-800">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Recommended Changes
          </span>
          <ul className="mt-1 space-y-0.5">
            {data.recommendedChanges.map((c, i) => (
              <li key={i} className="text-xs text-gray-400">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

export function SignalsBadges({ signals }: { signals: Signal[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-2"
    >
      {signals.map((s, i) => (
        <span
          key={i}
          className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-1 text-xs font-medium text-red-400"
          title={s.reason}
        >
          {s.name}
        </span>
      ))}
    </motion.div>
  );
}
