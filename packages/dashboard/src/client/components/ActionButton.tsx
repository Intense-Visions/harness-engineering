import { useEffect, useRef } from 'react';
import { motion, useSpring, useMotionValue, AnimatePresence } from 'framer-motion';
import { useApi } from '../hooks/useApi';
import { Loader2, Check, AlertCircle } from 'lucide-react';

interface Props {
  url: string;
  label: string;
  body?: unknown;
  /** Optional label shown while loading */
  loadingLabel?: string;
  onSuccess?: () => void;
  className?: string;
}

export function ActionButton({ url, label, body, loadingLabel, onSuccess, className = '' }: Props) {
  const { state, error, run } = useApi(url);
  const ref = useRef<HTMLButtonElement>(null);

  // Magnetic Spring Physics
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 15, stiffness: 150 };
  const tx = useSpring(mouseX, springConfig);
  const ty = useSpring(mouseY, springConfig);

  useEffect(() => {
    if (state === 'success') {
      onSuccess?.();
    }
  }, [state, onSuccess]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const x = e.clientX - (left + width / 2);
    const y = e.clientY - (top + height / 2);
    mouseX.set(x * 0.3); // Magnetic intensity
    mouseY.set(y * 0.3);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const isLoading = state === 'loading';
  const isSuccess = state === 'success';
  const isError = state === 'error';

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      <motion.button
        ref={ref}
        style={{ x: tx, y: ty }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileTap={{ scale: 0.95 }}
        onClick={() => void run(body)}
        disabled={isLoading}
        className={[
          'group relative flex items-center gap-2 overflow-hidden rounded-xl border px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-lg',
          isLoading
            ? 'cursor-not-allowed border-neutral-border bg-neutral-surface/50 text-neutral-muted'
            : '',
          isSuccess
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-emerald-500/20'
            : '',
          isError ? 'border-red-500/50 bg-red-500/10 text-red-400 shadow-red-500/20' : '',
          !isLoading && !isSuccess && !isError
            ? 'border-primary-500/50 bg-primary-500/10 text-primary-500 hover:bg-primary-500 hover:text-white shadow-primary-500/20'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Animated Scanning Line Background */}
        {!isLoading && !isSuccess && (
          <motion.div
            initial={{ left: '-100%' }}
            animate={{ left: '100%' }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"
          />
        )}

        {/* Content Icons */}
        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </motion.div>
          )}
          {isSuccess && (
            <motion.div
              key="success"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="h-3.5 w-3.5" />
            </motion.div>
          )}
          {isError && (
            <motion.div
              key="error"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <AlertCircle className="h-3.5 w-3.5" />
            </motion.div>
          )}
        </AnimatePresence>

        <span className="relative z-10">
          {isLoading ? (loadingLabel ?? 'Syncing...') : isSuccess ? 'Verified' : label}
        </span>

        {/* Glow Aura */}
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </motion.button>

      {isError && error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[10px] font-mono font-bold text-red-400 uppercase tracking-tighter"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
