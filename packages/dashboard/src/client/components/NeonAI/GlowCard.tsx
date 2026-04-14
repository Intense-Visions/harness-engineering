import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function GlowCard({ children, className = '', delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`group relative overflow-hidden rounded-xl border border-neutral-border bg-neutral-surface/40 p-1 backdrop-blur-md ${className}`}
    >
      {/* Animated Gradient Border Beam */}
      <div className="absolute inset-0 z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="animate-glow absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,var(--color-primary-500)_90deg,transparent_180deg,var(--color-secondary-400)_270deg,transparent_360deg)] opacity-20" />
      </div>

      <div className="relative z-10 h-full w-full rounded-[10px] bg-neutral-surface/90 p-4">
        {children}
      </div>
    </motion.div>
  );
}
