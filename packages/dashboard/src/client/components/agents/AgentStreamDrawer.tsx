import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio } from 'lucide-react';
import { AssistantBlocks } from '../chat/AssistantBlocks';
import type { ContentBlock } from '../../types/chat';
import type { RunningAgent } from '../../types/orchestrator';

interface Props {
  agent: RunningAgent | null;
  blocks: ContentBlock[];
  onClose: () => void;
}

export function AgentStreamDrawer({ agent, blocks, onClose }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new blocks arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks.length]);

  return (
    <AnimatePresence>
      {agent && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-800 bg-gray-950 sm:w-[560px] lg:w-[640px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Radio size={14} className="flex-shrink-0 text-emerald-400" />
                  <h2 className="truncate text-sm font-bold text-white">
                    {agent.issue?.title ?? agent.identifier}
                  </h2>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-gray-500">
                  {agent.identifier}
                </p>
              </div>
              <button
                onClick={onClose}
                className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Stream body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="mb-3 flex gap-1"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </motion.div>
                  <p className="text-xs text-gray-500">Waiting for agent output...</p>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-4">
                  <AssistantBlocks blocks={blocks} isStreaming={true} />
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
