import { motion } from 'framer-motion';
import { MapPin, Zap, Edit3, Download, Check } from 'lucide-react';
import type { SELResult, CMLResult, ActionState } from './types';

function ActionButton({
  icon,
  label,
  doneLabel,
  onClick,
  disabled,
  pending,
  done,
  title: tooltip,
  color = 'border-gray-700 text-gray-400 hover:border-primary-500/50 hover:text-primary-400',
}: {
  icon: React.ReactNode;
  label: string;
  doneLabel: string;
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  done: boolean;
  title?: string;
  color?: string;
}) {
  return (
    <motion.button
      {...(!disabled ? { whileHover: { scale: 1.02 }, whileTap: { scale: 0.98 } } : {})}
      onClick={onClick}
      disabled={disabled || pending || done}
      {...(tooltip != null ? { title: tooltip } : {})}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
        done ? 'border-emerald-500/30 text-emerald-400' : color
      }`}
    >
      {pending ? (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : done ? (
        <Check size={14} />
      ) : (
        icon
      )}
      {done ? doneLabel : label}
    </motion.button>
  );
}

/** An action can start only from idle or a settled (done) state. */
function isBusy(actionState: ActionState): boolean {
  return (
    actionState !== 'idle' && actionState !== 'roadmap-done' && actionState !== 'dispatch-done'
  );
}

export function AnalyzeActionBar({
  selResult,
  cmlResult,
  actionState,
  actionError,
  onAddToRoadmap,
  onDispatchNow,
  onRefine,
  onExportSpec,
}: {
  selResult: SELResult | null;
  cmlResult: CMLResult | null;
  actionState: ActionState;
  actionError: string | null;
  onAddToRoadmap: () => void;
  onDispatchNow: () => void;
  onRefine: () => void;
  onExportSpec: () => void;
}) {
  const busy = isBusy(actionState);
  const isLocalRoute = cmlResult?.recommendedRoute === 'local';
  const refineDisabled =
    !selResult || (selResult.unknowns.length === 0 && selResult.ambiguities.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4"
    >
      <ActionButton
        icon={<MapPin size={14} />}
        label="Add to Roadmap"
        doneLabel="Added"
        onClick={onAddToRoadmap}
        disabled={busy}
        pending={actionState === 'roadmap-pending'}
        done={actionState === 'roadmap-done'}
      />
      <ActionButton
        icon={<Zap size={14} />}
        label="Dispatch Now"
        doneLabel="Dispatched"
        onClick={onDispatchNow}
        disabled={!isLocalRoute || busy}
        pending={actionState === 'dispatch-pending'}
        done={actionState === 'dispatch-done'}
        {...(!isLocalRoute ? { title: 'Only available for local-route items' } : {})}
        color="border-gray-700 text-gray-400 hover:border-emerald-500/50 hover:text-emerald-400"
      />
      <ActionButton
        icon={<Edit3 size={14} />}
        label="Refine"
        doneLabel="Refine"
        onClick={onRefine}
        disabled={refineDisabled}
        pending={false}
        done={false}
        title="Pre-populate description with unknowns and ambiguities for re-analysis"
        color="border-gray-700 text-gray-400 hover:border-amber-500/50 hover:text-amber-400"
      />
      <ActionButton
        icon={<Download size={14} />}
        label="Export Spec"
        doneLabel="Export Spec"
        onClick={onExportSpec}
        disabled={!selResult}
        pending={false}
        done={false}
        color="border-gray-700 text-gray-400 hover:border-blue-500/50 hover:text-blue-400"
      />
      {actionError && <span className="text-xs text-red-400">{actionError}</span>}
    </motion.div>
  );
}
