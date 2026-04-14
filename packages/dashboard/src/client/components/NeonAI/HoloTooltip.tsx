import { motion, AnimatePresence } from 'framer-motion';
import { useState, type ReactNode } from 'react';

interface Props {
  content: string;
  children: ReactNode;
}

export function HoloTooltip({ content, children }: Props) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 z-[100] pointer-events-none"
          >
            <div className="relative rounded-lg border border-primary-500/30 bg-neutral-bg/80 px-3 py-2 text-[10px] font-mono leading-tight text-neutral-text backdrop-blur-xl shadow-[0_0_20px_rgba(79,70,229,0.2)]">
              {/* Scanline Effect */}
              <div className="absolute inset-0 overflow-hidden rounded-lg opacity-10">
                <div className="h-[1px] w-full bg-primary-500 animate-scanline" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-1.5 mb-1 border-b border-primary-500/20 pb-1">
                  <div className="h-1 w-1 rounded-full bg-primary-500" />
                  <span className="font-bold uppercase tracking-widest text-primary-500">
                    Data_Link
                  </span>
                </div>
                {content}
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-neutral-bg/80" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
