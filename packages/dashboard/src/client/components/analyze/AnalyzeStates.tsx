import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export function AnalyzeHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-full bg-primary-500/10 p-2 text-primary-500">
        <Sparkles size={20} className="drop-shadow-[0_0_10px_var(--color-primary-500)]" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analyze</h1>
        <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">
          Intelligence Pipeline
        </p>
      </div>
    </div>
  );
}

export function AnalyzeStatus({ status }: { status: string | null }) {
  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2"
        >
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-500 shadow-[0_0_10px_var(--color-primary-500)]" />
          <span className="font-mono text-xs uppercase tracking-widest text-gray-400">
            {status}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AnalyzeError({ error }: { error: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400"
    >
      {error}
    </motion.div>
  );
}

export function AnalyzeEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-primary-500/10 p-4 text-primary-500">
        <Sparkles size={32} className="drop-shadow-[0_0_10px_var(--color-primary-500)]" />
      </div>
      <h2 className="mb-1 text-lg font-bold">Intelligence Pipeline</h2>
      <p className="max-w-sm text-xs text-gray-500">
        Submit a work item description to run it through the SEL, CML, and PESL analysis layers.
        Results stream in real-time.
      </p>
    </div>
  );
}
