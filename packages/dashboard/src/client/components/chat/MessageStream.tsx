import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { ChatMessage } from '../../types/chat';
import { AssistantBlocks } from './AssistantBlocks';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  className?: string;
}

export function MessageStream({ messages, streaming, className }: Props) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  return (
    <div className={`flex-1 overflow-hidden rounded-2xl border border-neutral-border bg-neutral-bg/40 backdrop-blur-sm shadow-inner relative ${className}`}>
      {messages.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
        >
          <div className="mb-4 rounded-full bg-primary-500/10 p-4 text-primary-500">
            <Cpu size={32} className="drop-shadow-[0_0_10px_var(--color-primary-500)]" />
          </div>
          <h2 className="mb-1 text-lg font-bold">Neural Engine Ready</h2>
          <p className="max-w-xs text-xs text-neutral-muted">
            Initiate prompt sequence. The context from the escalated issue is pre-loaded into
            working memory.
          </p>
        </motion.div>
      )}
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        followOutput="smooth"
        initialTopMostItemIndex={messages.length - 1}
        itemContent={(i, msg) => (
          <div className="px-6 py-3">
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className="mb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-neutral-muted">
                  {msg.role === 'user' ? (
                    <>
                      <span>Operator</span>
                      <div className="h-1.5 w-1.5 rounded-full bg-neutral-muted" />
                    </>
                  ) : (
                    <>
                      <div className="h-1.5 w-1.5 rounded-full bg-primary-500 shadow-[0_0_5px_var(--color-primary-500)]" />
                      <span>Harness Agent</span>
                    </>
                  )}
                </div>
                <div
                  className={[
                    'rounded-2xl px-5 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary-500 text-white shadow-lg'
                      : 'bg-neutral-surface/60 border border-neutral-border backdrop-blur-xl text-neutral-text',
                  ].join(' ')}
                >
                  {msg.role === 'user' ? (
                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  ) : (
                    <AssistantBlocks
                      blocks={msg.blocks}
                      isStreaming={streaming && i === messages.length - 1}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      />
    </div>
  );
}
