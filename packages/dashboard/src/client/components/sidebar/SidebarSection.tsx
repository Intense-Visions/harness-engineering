import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Props {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SidebarSection({ label, count, defaultOpen = true, children }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted hover:text-neutral-text transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} />
        </motion.div>
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-primary-500/20 px-1.5 py-0.5 text-[8px] font-bold text-primary-500 tabular-nums">
            {count}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
