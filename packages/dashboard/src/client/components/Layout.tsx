import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraBackground } from './NeonAI/AuraBackground';

interface Props {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Overview' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/health', label: 'Health' },
  { to: '/graph', label: 'Graph' },
  { to: '/ci', label: 'CI' },
  { to: '/impact', label: 'Impact' },
  { to: '/orchestrator', label: 'Agents' },
  { to: '/orchestrator/attention', label: 'Attention' },
] as const;

export function Layout({ children }: Props) {
  const location = useLocation();

  return (
    <div className="min-h-screen text-neutral-text selection:bg-primary-500/30">
      <AuraBackground />

      <header className="sticky top-0 z-50 border-b border-neutral-border bg-neutral-surface/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary-500 shadow-[0_0_10px_var(--color-primary-500)]" />
            <span className="text-sm font-bold tracking-tighter uppercase text-white">Harness</span>
          </div>

          <nav className="flex gap-1">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'relative rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                    isActive
                      ? 'text-white'
                      : 'text-neutral-muted hover:bg-neutral-surface hover:text-neutral-text',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {label}
                    {isActive && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 z-[-1] rounded-md bg-white/5"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    {isActive && (
                      <div className="absolute -bottom-[13px] left-0 right-0 h-[2px] bg-primary-500 shadow-[0_0_8px_var(--color-primary-500)]" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
