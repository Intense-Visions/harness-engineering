import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio, Cpu, GitBranch, Clock, Zap } from 'lucide-react';
import { AssistantBlocks } from '../chat/AssistantBlocks';
import type { ContentBlock } from '../../types/chat';
import type { RunningAgent } from '../../types/orchestrator';

interface Props {
  agent: RunningAgent | null;
  blocks: ContentBlock[];
  onClose: () => void;
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function AgentStreamDrawer({ agent, blocks, onClose }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks.length]);

  return (
    <AnimatePresence>
      {agent && (
        <motion.div
          key="agent-stream"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Centered dialog */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto flex flex-col w-full max-w-[1400px] h-full max-h-[85vh] rounded-2xl border border-white/15 bg-[#111113] backdrop-blur-3xl shadow-[0_25px_80px_-12px_rgba(0,0,0,0.8),0_0_40px_-8px_rgba(16,185,129,0.15)] ring-1 ring-white/5 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <Radio size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold tracking-tight text-white truncate">
                      {agent.issue?.title ?? agent.identifier}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Stream
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-muted hover:bg-white/5 hover:text-white transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content: context left, stream right */}
              <div className="flex-1 flex overflow-hidden">
                {/* Agent context pane */}
                <div className="w-[340px] flex-shrink-0 border-r border-white/10 bg-black/20 overflow-y-auto p-6">
                  <div className="flex flex-col gap-6">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2 flex items-center gap-1.5">
                        <Cpu size={12} />
                        Agent Details
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Identifier</span>
                          <span className="font-mono text-gray-300 truncate ml-3 text-right">
                            {agent.identifier}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Phase</span>
                          <span className="text-emerald-400 font-medium">{agent.phase}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Backend</span>
                          <span className="text-blue-400">{agent.session?.backendName ?? '-'}</span>
                        </div>
                      </div>
                    </div>

                    {agent.issue?.description && (
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">
                          Description
                        </h3>
                        <p className="text-sm leading-relaxed text-gray-300">
                          {agent.issue.description}
                        </p>
                      </div>
                    )}

                    {agent.session && (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-1.5">
                          <Zap size={12} />
                          Session Stats
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center">
                            <span className="block text-lg font-bold text-white">
                              {agent.session.turnCount}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Turns
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="block text-lg font-bold text-white">
                              {formatTokens(agent.session.totalTokens)}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Tokens
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="block text-lg font-bold text-emerald-400">
                              {formatTokens(agent.session.inputTokens)}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Input
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="block text-lg font-bold text-blue-400">
                              {formatTokens(agent.session.outputTokens)}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Output
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>Running for {formatDuration(agent.startedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Stream body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
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
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
