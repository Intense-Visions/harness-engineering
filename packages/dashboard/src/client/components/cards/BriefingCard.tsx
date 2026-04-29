import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, AlertTriangle, Check, X } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  PendingInteraction,
  InteractionEnrichedSpec,
  InteractionComplexityScore,
} from '../../types/orchestrator';

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function EnrichedSpecSummary({ spec }: { spec: InteractionEnrichedSpec }) {
  return (
    <div className="space-y-3 rounded-lg border border-primary-500/20 bg-primary-500/5 p-3">
      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-primary-500">
        Enriched Spec (SEL)
      </h4>
      <div>
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-muted">
          Intent
        </span>
        <p className="mt-0.5 text-xs text-white">{spec.intent}</p>
      </div>
      <div>
        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-muted">
          Summary
        </span>
        <p className="mt-0.5 text-xs text-neutral-text/80 leading-relaxed">{spec.summary}</p>
      </div>
      {spec.affectedSystems.length > 0 && (
        <div>
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-muted">
            Affected Systems
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {spec.affectedSystems.map((sys) => (
              <span
                key={sys.name}
                className="rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-400"
                title={`Confidence: ${Math.round(sys.confidence * 100)}% | Tests: ${sys.testCoverage} | Deps: ${sys.transitiveDeps.length}`}
              >
                {sys.name}
                {sys.graphNodeId && (
                  <span className="ml-1 text-blue-500/50">{Math.round(sys.confidence * 100)}%</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {spec.unknowns.length > 0 && (
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-400">
              Unknowns ({spec.unknowns.length})
            </span>
            <ul className="mt-0.5 space-y-0.5">
              {spec.unknowns.map((u, i) => (
                <li key={i} className="text-[11px] text-neutral-text/70">
                  {u}
                </li>
              ))}
            </ul>
          </div>
        )}
        {spec.ambiguities.length > 0 && (
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-orange-400">
              Ambiguities ({spec.ambiguities.length})
            </span>
            <ul className="mt-0.5 space-y-0.5">
              {spec.ambiguities.map((a, i) => (
                <li key={i} className="text-[11px] text-neutral-text/70">
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
        {spec.riskSignals.length > 0 && (
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-red-400">
              Risk Signals ({spec.riskSignals.length})
            </span>
            <ul className="mt-0.5 space-y-0.5">
              {spec.riskSignals.map((r, i) => (
                <li key={i} className="text-[11px] text-neutral-text/70">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const ROUTE_COLORS: Record<string, string> = {
  local: 'text-emerald-400',
  human: 'text-amber-400',
  'simulation-required': 'text-purple-400',
};

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-neutral-muted">{label}</span>
        <span className={color}>{pct}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${color.replace('text-', 'bg-')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ComplexityScoreSummary({ score }: { score: InteractionComplexityScore }) {
  return (
    <div className="space-y-3 rounded-lg border border-secondary-400/20 bg-secondary-400/5 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-secondary-400">
          Complexity (CML)
        </h4>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${RISK_COLORS[score.riskLevel] ?? RISK_COLORS.medium}`}
          >
            {score.riskLevel}
          </span>
          <span
            className={`text-[10px] font-mono font-bold ${ROUTE_COLORS[score.recommendedRoute] ?? 'text-neutral-muted'}`}
          >
            {score.recommendedRoute}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        <ScoreBar value={score.overall} label="Overall" color="text-primary-500" />
        <ScoreBar value={score.dimensions.structural} label="Structural" color="text-blue-400" />
        <ScoreBar value={score.dimensions.semantic} label="Semantic" color="text-purple-400" />
        <ScoreBar value={score.dimensions.historical} label="Historical" color="text-yellow-400" />
        <ScoreBar value={score.confidence} label="Confidence" color="text-emerald-400" />
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-2 md:grid-cols-4">
        <div className="text-center">
          <span className="block text-sm font-bold text-white">{score.blastRadius.services}</span>
          <span className="text-[9px] uppercase tracking-widest text-neutral-muted">Services</span>
        </div>
        <div className="text-center">
          <span className="block text-sm font-bold text-white">{score.blastRadius.modules}</span>
          <span className="text-[9px] uppercase tracking-widest text-neutral-muted">Modules</span>
        </div>
        <div className="text-center">
          <span className="block text-sm font-bold text-white">
            {score.blastRadius.filesEstimated}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-neutral-muted">Files</span>
        </div>
        <div className="text-center">
          <span className="block text-sm font-bold text-white">
            {score.blastRadius.testFilesAffected}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-neutral-muted">
            Test Files
          </span>
        </div>
      </div>
      {score.reasoning.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-neutral-muted">
            Reasoning
          </span>
          <ul className="mt-0.5 space-y-0.5">
            {score.reasoning.map((r, i) => (
              <li key={i} className="text-[11px] text-neutral-text/70">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface Props {
  interaction: PendingInteraction;
  collapsed: boolean;
  onClaim: () => void;
  onDismiss: () => void;
}

export function BriefingCard({ interaction, collapsed, onClaim, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(!collapsed);
  const { context, reasons } = interaction;

  return (
    <div className="border-b border-white/[0.06] bg-neutral-surface/20 backdrop-blur-sm">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <AlertTriangle size={16} className="text-semantic-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{context.issueTitle}</h3>
          {collapsed && (
            <p className="text-[10px] text-neutral-muted truncate">
              {reasons[0] || 'Needs attention'}
            </p>
          )}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClaim();
              }}
              className="flex items-center gap-1 rounded-lg bg-primary-500/10 border border-primary-500/20 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-primary-500 hover:bg-primary-500/20 transition-colors"
            >
              <Check size={10} />
              Claim
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="flex items-center gap-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-neutral-muted hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X size={10} />
              Dismiss
            </button>
          </div>
        )}
        <motion.div animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-neutral-muted" />
        </motion.div>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 space-y-3">
              {/* Description */}
              {context.issueDescription && (
                <div className="text-xs text-neutral-text/80 leading-relaxed prose prose-invert prose-xs max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{context.issueDescription}</Markdown>
                </div>
              )}

              {/* Escalation reasons */}
              <div className="space-y-1">
                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
                  Escalation Reasons
                </h4>
                {reasons.map((reason, i) => (
                  <div
                    key={i}
                    className="text-xs text-neutral-text/80 leading-relaxed prose prose-invert prose-xs max-w-none"
                  >
                    <Markdown remarkPlugins={[remarkGfm]}>{reason}</Markdown>
                  </div>
                ))}
              </div>

              {/* Analysis panels */}
              {context.enrichedSpec && <EnrichedSpecSummary spec={context.enrichedSpec} />}
              {context.complexityScore && (
                <ComplexityScoreSummary score={context.complexityScore} />
              )}

              {/* Related files */}
              {context.relatedFiles.length > 0 && (
                <div>
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted mb-1">
                    Related Files
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {context.relatedFiles.map((f) => (
                      <span
                        key={f}
                        className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono text-neutral-muted"
                      >
                        {f.split('/').pop()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
