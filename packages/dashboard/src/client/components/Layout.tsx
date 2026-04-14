import { useState, useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraBackground } from './NeonAI/AuraBackground';

interface Props {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/health', label: 'Health' },
  { to: '/graph', label: 'Graph' },
  { to: '/ci', label: 'CI' },
  { to: '/impact', label: 'Impact' },
  { to: '/orchestrator', label: 'Agents', end: true },
  { to: '/orchestrator/attention', label: 'Attention' },
] as const;

export function Layout({ children }: Props) {
  const location = useLocation();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setIsNavigating(true);
    const timer = setTimeout(() => setIsNavigating(false), 800);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="min-h-screen text-neutral-text selection:bg-primary-500/30 overflow-x-hidden"
      onMouseMove={handleMouseMove}
    >
      <div className="neural-noise" />
      <AuraBackground mouseX={mousePos.x} mouseY={mousePos.y} />

      {/* Global Neural Progress Bar */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'circOut' }}
            className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500 via-secondary-400 to-primary-500 z-[100] origin-left shadow-[0_0_15px_var(--color-primary-500)]"
          />
        )}
      </AnimatePresence>

      <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-6 px-6 py-2 rounded-full border border-white/10 bg-neutral-bg/60 backdrop-blur-2xl shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 group cursor-pointer border-r border-white/10 pr-4">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary-500 shadow-[0_0_15px_var(--color-primary-500)] group-hover:scale-125 transition-transform" />
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white group-hover:text-glow-primary transition-all">
              Harness
            </span>
          </div>

          <nav className="flex gap-1 relative group/nav">
            {/* Nav Spotlight */}
            <div
              className="pointer-events-none absolute -inset-2 z-0 opacity-0 transition-opacity duration-500 group-hover/nav:opacity-100"
              style={{
                background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(79, 70, 229, 0.1), transparent 40%)`,
              }}
            />
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'relative rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-300',
                    isActive ? 'text-white' : 'text-neutral-muted hover:text-neutral-text',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative z-10">{label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 z-0 rounded-full bg-white/5 border border-white/10"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pt-32 pb-12">
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
