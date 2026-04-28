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
    <div className="space-y-2 rounded-lg border border-primary-500/20 bg-primary-500/5 p-3">
      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-primary-500">
        Enriched Spec (SEL)
      </h4>
      <p className="text-xs text-neutral-text">{spec.intent}</p>
      {spec.affectedSystems.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {spec.affectedSystems.map((sys) => (
            <span
              key={sys.name}
              className="rounded-md border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-400"
            >
              {sys.name} {Math.round(sys.confidence * 100)}%
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-3 text-[9px]">
        {spec.unknowns.length > 0 && (
          <span className="text-amber-400">{spec.unknowns.length} unknowns</span>
        )}
        {spec.ambiguities.length > 0 && (
          <span className="text-orange-400">{spec.ambiguities.length} ambiguities</span>
        )}
        {spec.riskSignals.length > 0 && (
          <span className="text-red-400">{spec.riskSignals.length} risks</span>
        )}
      </div>
    </div>
  );
}

function ComplexityScoreSummary({ score }: { score: InteractionComplexityScore }) {
  return (
    <div className="space-y-2 rounded-lg border border-secondary-400/20 bg-secondary-400/5 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-secondary-400">
          Complexity (CML)
        </h4>
        <span
          className={`inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${RISK_COLORS[score.riskLevel] ?? RISK_COLORS.medium}`}
        >
          {score.riskLevel}
        </span>
      </div>
      <div className="flex gap-3 text-[10px]">
        <span className="text-neutral-muted">
          Overall: <span className="text-white font-bold">{Math.round(score.overall * 100)}%</span>
        </span>
        <span className="text-neutral-muted">
          Blast:{' '}
          <span className="text-white font-bold">{score.blastRadius.filesEstimated} files</span>
        </span>
        <span className="text-neutral-muted">
          Route: <span className="text-white font-bold">{score.recommendedRoute}</span>
        </span>
      </div>
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
