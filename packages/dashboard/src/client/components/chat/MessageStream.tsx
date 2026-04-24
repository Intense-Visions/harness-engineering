import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { AssistantBlocks } from './AssistantBlocks';
import { NeuralOrganism } from './NeuralOrganism';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  className?: string;
}

export function MessageStream({ messages, streaming, className }: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const rafRef = useRef(0);

  // Virtuoso's followOutput only fires when new items are appended.
  // During streaming, the last message's blocks grow but the data array
  // length stays the same, so we manually scroll to the end.
  useEffect(() => {
    if (streaming && atBottom && messages.length > 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      });
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [streaming, atBottom, messages]);

  const scrollToTop = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 0,
      align: 'start',
      behavior: 'smooth',
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      align: 'end',
      behavior: 'smooth',
    });
  }, [messages.length]);

  return (
    <div
      className={`h-full overflow-hidden rounded-2xl border border-neutral-border bg-neutral-bg/40 backdrop-blur-sm shadow-inner relative ${className}`}
    >
      <AnimatePresence>
        {!atTop && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={scrollToTop}
            className="absolute top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white hover:bg-white/20 transition-all shadow-2xl shadow-black/50"
            title="Jump to top"
          >
            <ChevronUp size={20} />
          </motion.button>
        )}

        {!atBottom && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 hover:bg-primary-400 text-white transition-all shadow-2xl shadow-primary-500/40 border border-white/20"
            title="Jump to bottom"
          >
            <ChevronDown size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {messages.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
        >
          {/* Atmospheric bioluminescent field behind organism */}
          <div className="relative mb-6">
            <motion.div
              className="absolute inset-0 -m-16 rounded-full"
              animate={{
                opacity: [0.04, 0.08, 0.05, 0.07, 0.04],
                scale: [1, 1.15, 1.05, 1.1, 1],
              }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                background:
                  'radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(79,70,229,0.1) 40%, transparent 70%)',
                filter: 'blur(20px)',
              }}
            />
            <motion.div
              className="absolute inset-0 -m-10 rounded-full"
              animate={{
                opacity: [0.06, 0.12, 0.08, 0.1, 0.06],
                scale: [1, 1.08, 1.02, 1.06, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5,
              }}
              style={{
                background: 'radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 60%)',
                filter: 'blur(12px)',
              }}
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            >
              <NeuralOrganism size={120} />
            </motion.div>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mb-2 text-base font-bold tracking-tight text-neutral-text"
          >
            Neural Engine Ready
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="max-w-[280px] text-[11px] leading-relaxed text-neutral-muted"
          >
            Awaiting prompt sequence. Issue context is pre-loaded into working memory.
          </motion.p>
        </motion.div>
      )}
      <Virtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        data={messages}
        followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
        atBottomStateChange={setAtBottom}
        atTopStateChange={setAtTop}
        atBottomThreshold={200}
        initialTopMostItemIndex={messages.length - 1}
        itemContent={(i, msg) => (
          <div className="px-6 py-3">
            {msg.role === 'user' ? (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="flex justify-end"
              >
                <div className="max-w-[85%] text-right">
                  <div className="mb-1.5 flex items-center justify-end gap-2 text-[9px] font-bold uppercase tracking-widest text-neutral-muted">
                    <span>Operator</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-neutral-muted/60" />
                  </div>
                  <div className="rounded-2xl px-5 py-3 text-sm leading-relaxed bg-primary-500 text-white shadow-[0_4px_24px_-4px_rgba(79,70,229,0.4)]">
                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="px-1 py-1">
                  <AssistantBlocks
                    blocks={msg.blocks}
                    isStreaming={streaming && i === messages.length - 1}
                  />
                </div>
              </motion.div>
            )}
          </div>
        )}
      />
    </div>
  );
}
