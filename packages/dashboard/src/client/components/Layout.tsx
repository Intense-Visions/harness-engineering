import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, MessageSquareOff } from 'lucide-react';
import { AuraBackground } from './NeonAI/AuraBackground';
import { DomainNav } from './DomainNav';
import { useChatPanel } from '../hooks/useChatPanel';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { ChatPanel } from './chat/ChatPanel';

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  const location = useLocation();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isNavigating, setIsNavigating] = useState(false);
  const { isOpen: isChatOpen, toggle: toggleChat } = useChatPanel();

  useKeyboardShortcut('j', toggleChat, { meta: true, ctrl: true });

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
      className="min-h-screen text-neutral-text selection:bg-primary-500/30 overflow-x-hidden flex"
      onMouseMove={handleMouseMove}
    >
      <div className="neural-noise" />
      <AuraBackground mouseX={mousePos.x} mouseY={mousePos.y} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
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

        <header className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="flex items-center gap-6 px-6 py-2 rounded-full border border-white/10 bg-neutral-bg/60 backdrop-blur-2xl shadow-2xl shadow-black/50 pointer-events-auto">
            <div className="flex items-center gap-2 group cursor-pointer border-r border-white/10 pr-4">
              <div className="h-2 w-2 animate-pulse rounded-full bg-primary-500 shadow-[0_0_15px_var(--color-primary-500)] group-hover:scale-125 transition-transform" />
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-white group-hover:text-glow-primary transition-all">
                Harness
              </span>
            </div>

            <DomainNav />

            {/* Chat toggle */}
            <button
              onClick={toggleChat}
              className="flex items-center gap-1.5 border-l border-white/10 pl-4 text-neutral-muted hover:text-white transition-colors"
              title={isChatOpen ? 'Hide chat (⌘⌃J)' : 'Show chat (⌘⌃J)'}
            >
              {isChatOpen ? <MessageSquareOff size={14} /> : <MessageSquare size={14} />}
              <span className="text-[9px] font-bold uppercase tracking-widest">
                {isChatOpen ? 'Hide' : 'Chat'}
              </span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-6 pt-32 pb-12 flex-1 flex flex-col transition-all duration-500">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex-1 flex flex-col"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Persistent Chat Column */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 420, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative flex-shrink-0 h-screen sticky top-0 overflow-hidden"
          >
            <div className="w-[420px] h-full">
              <ChatPanel isOpen={true} onClose={toggleChat} mode="column" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
