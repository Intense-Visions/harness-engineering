import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { type MouseEvent, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Optional unique identifier for tactical stamp */
  uid?: string;
}

export function GlowCard({ children, className = '', delay = 0, uid }: Props) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function onMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={onMouseMove}
      className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-neutral-surface/30 p-[1px] backdrop-blur-xl shadow-2xl shadow-black/50 ${className}`}
    >
      {/* Tactical Corner Markers */}
      <div className="absolute top-2 left-2 flex gap-0.5 opacity-20 group-hover:opacity-50 transition-opacity">
        <div className="h-1 w-1 bg-white rounded-full" />
        <div className="h-1 w-1 border border-white rounded-full" />
      </div>
      <div className="absolute top-2 right-2 flex gap-0.5 opacity-20 group-hover:opacity-50 transition-opacity">
        <div className="h-1 w-4 border-t border-white" />
      </div>
      <div className="absolute bottom-2 left-2 opacity-10 font-mono text-[8px] tracking-tighter uppercase select-none">
        {uid ?? 'MODULE_SYS_77'}
      </div>

      {/* Animated Spotlight Border */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              350px circle at ${mouseX}px ${mouseY}px,
              rgba(99, 102, 241, 0.4),
              transparent 80%
            )
          `,
        }}
      />

      {/* Inner Hover Highlight (Glass Reflection) */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              400px circle at ${mouseX}px ${mouseY}px,
              rgba(99, 102, 241, 0.08),
              transparent 80%
            )
          `,
        }}
      />

      <div className="relative z-20 h-full w-full rounded-[15px] bg-neutral-surface/70 p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] transition-colors duration-500 group-hover:bg-neutral-surface/50">
        {children}
      </div>
    </motion.div>
  );
}
