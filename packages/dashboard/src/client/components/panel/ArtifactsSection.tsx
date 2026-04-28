import { FileCode2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ArtifactItem {
  path: string;
  action: 'created' | 'modified' | 'deleted';
}

interface Props {
  artifacts: ArtifactItem[];
}

const ACTION_COLORS = {
  created: 'text-semantic-success',
  modified: 'text-semantic-warning',
  deleted: 'text-semantic-error',
} as const;

const ACTION_LABELS = {
  created: '+',
  modified: '~',
  deleted: '-',
} as const;

export function ArtifactsSection({ artifacts }: Props) {
  if (artifacts.length === 0) return null;

  return (
    <div className="border-b border-white/[0.06] pb-3">
      <div className="flex items-center gap-2 mb-2">
        <FileCode2 size={12} className="text-neutral-muted" />
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
          Artifacts
        </h4>
        <span className="text-[9px] text-neutral-muted/60 tabular-nums">{artifacts.length}</span>
      </div>
      <AnimatePresence mode="popLayout">
        {artifacts.map((artifact) => (
          <motion.div
            key={artifact.path}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 py-0.5 group"
          >
            <span className={`text-[10px] font-bold ${ACTION_COLORS[artifact.action]}`}>
              {ACTION_LABELS[artifact.action]}
            </span>
            <span className="text-xs text-neutral-text font-mono truncate flex-1">
              {artifact.path.split('/').pop()}
            </span>
            <span className="hidden group-hover:block">
              <ExternalLink size={10} className="text-neutral-muted" />
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
