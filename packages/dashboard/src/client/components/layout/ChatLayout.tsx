import { useState, useEffect, createContext, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraBackground } from '../NeonAI/AuraBackground';
import { ThreadSidebar } from './ThreadSidebar';
import { ContextPanel, type PanelState } from './ContextPanel';
import { useThreadStore } from '../../stores/threadStore';
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket';
import { useAttentionSync } from '../../hooks/useAttentionSync';
import { useAgentSync } from '../../hooks/useAgentSync';
import type { ContentBlock } from '../../types/chat';

/** Context providing per-agent ContentBlock[] from the WebSocket. */
export const AgentEventsContext = createContext<Record<string, ContentBlock[]>>({});

interface Props {
  children: ReactNode;
}

export function ChatLayout({ children }: Props) {
  const location = useLocation();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isNavigating, setIsNavigating] = useState(false);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator -- URL path, not filesystem
  const isSystemRoute = location.pathname.startsWith('/s/');
  const socket = useOrchestratorSocket();
  useAttentionSync(socket);
  useAgentSync(socket);

  // Panel state — null for system routes, read from ThreadStore for threads
  const storedPanelState = useThreadStore((s) =>
    activeThreadId ? (s.panelState.get(activeThreadId) ?? null) : null
  );
  const panelState: PanelState | null = isSystemRoute ? null : storedPanelState;

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
      className="h-screen flex text-neutral-text selection:bg-primary-500/30 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <div className="neural-noise" />
      <AuraBackground mouseX={mousePos.x} mouseY={mousePos.y} />

      {/* Left: Thread Sidebar */}
      <ThreadSidebar />

      {/* Center: Thread View */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-y-auto">
        <AnimatePresence>
          {isNavigating && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'circOut' }}
              className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500 via-secondary-400 to-primary-500 z-50 origin-left shadow-[0_0_15px_var(--color-primary-500)]"
            />
          )}
        </AnimatePresence>

        <AgentEventsContext.Provider value={socket.agentEvents}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="flex-1 flex flex-col"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </AgentEventsContext.Provider>
      </main>

      {/* Right: Context Panel */}
      <ContextPanel state={panelState} />
    </div>
  );
}
