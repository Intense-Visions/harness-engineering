import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FlaskConical, Send } from 'lucide-react';

interface Props {
  initialTitle: string;
  initialDescription: string;
  initialLabels: string[];
  collapsed: boolean;
  onSubmit: (data: { title: string; description: string; labels: string[] }) => void;
}

export function AnalysisFormCard({
  initialTitle,
  initialDescription,
  initialLabels,
  collapsed,
  onSubmit,
}: Props) {
  const [expanded, setExpanded] = useState(!collapsed);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [labelsStr, setLabelsStr] = useState(initialLabels.join(', '));

  const handleSubmit = () => {
    if (!title.trim()) return;
    const labels = labelsStr
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    onSubmit({ title: title.trim(), description: description.trim(), labels });
  };

  return (
    <div className="border-b border-white/[0.06] bg-neutral-surface/20 backdrop-blur-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <FlaskConical size={16} className="text-accent-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{title || 'New Analysis'}</h3>
          {collapsed && (
            <p className="text-[10px] text-neutral-muted truncate">
              Analysis complete — expand to see inputs
            </p>
          )}
        </div>
        <motion.div animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-neutral-muted" />
        </motion.div>
      </button>

      {/* Form */}
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
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted block mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={collapsed}
                  placeholder="Feature or issue title..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-neutral-muted/40 focus:border-primary-500/40 focus:outline-none focus:ring-2 focus:ring-primary-500/10 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted block mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={collapsed}
                  rows={3}
                  placeholder="Optional context..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-neutral-muted/40 focus:border-primary-500/40 focus:outline-none focus:ring-2 focus:ring-primary-500/10 resize-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted block mb-1">
                  Labels
                </label>
                <input
                  type="text"
                  value={labelsStr}
                  onChange={(e) => setLabelsStr(e.target.value)}
                  disabled={collapsed}
                  placeholder="Comma-separated labels..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-neutral-muted/40 focus:border-primary-500/40 focus:outline-none focus:ring-2 focus:ring-primary-500/10 disabled:opacity-50"
                />
              </div>
              {!collapsed && (
                <button
                  onClick={handleSubmit}
                  disabled={!title.trim()}
                  className="flex items-center gap-2 rounded-lg bg-accent-500/10 border border-accent-500/20 px-4 py-2 text-xs font-bold text-accent-500 hover:bg-accent-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send size={12} />
                  Run Analysis
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
