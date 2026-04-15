import React from 'react';
import { motion } from 'framer-motion';
import { Play, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import type { SkillEntry } from '../../types/skills';
import type { ChatContextState } from '../../hooks/useChatContext';
import { generateBriefingSummary } from '../../utils/context-to-prompt';

interface Props {
  skill: SkillEntry;
  context: ChatContextState;
  onExecute: () => void;
  onCancel?: () => void;
}

export function BriefingPanel({ skill, context, onExecute, onCancel }: Props) {
  const summary = generateBriefingSummary(skill, context.data);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col gap-6 p-6 h-full overflow-y-auto custom-scrollbar"
    >
      {/* Skill Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary-400">
          <Sparkles size={16} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">
            Strategy Briefing
          </span>
        </div>
        <h2 className="text-2xl font-bold text-white">{skill.name}</h2>
        <p className="text-sm text-neutral-muted leading-relaxed">{skill.description}</p>
      </div>

      {/* Context Summary Card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted">
            Telemetry Findings
          </h3>
          {context.isLoading && <Loader2 size={14} className="animate-spin text-primary-500" />}
        </div>

        {context.error ? (
          <div className="flex gap-3 text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-xs leading-tight">{context.error}</p>
          </div>
        ) : context.isLoading ? (
          <div className="flex flex-col gap-2">
            <div className="h-4 w-3/4 bg-white/5 animate-pulse rounded" />
            <div className="h-4 w-1/2 bg-white/5 animate-pulse rounded" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-white leading-relaxed font-medium">{summary}</p>
            <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Context automatically extracted from latest dashboard telemetry</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Area */}
      <div className="mt-auto pt-6 flex flex-col gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onExecute}
          disabled={context.isLoading}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-primary-500 py-4 text-sm font-bold text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={18} fill="currentColor" />
          Execute {skill.name}
        </motion.button>

        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-muted hover:text-white transition-colors"
          >
            Change Command
          </button>
        )}
      </div>

      <div className="text-center">
        <p className="text-[9px] font-mono text-neutral-muted/30 uppercase tracking-tighter">
          Verification loop: pre-launch strategy pass active
        </p>
      </div>
    </motion.div>
  );
}
