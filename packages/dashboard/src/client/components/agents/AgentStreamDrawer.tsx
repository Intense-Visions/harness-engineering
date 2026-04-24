import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { X, Radio, Cpu, Clock, Zap, History, ChevronUp, ChevronDown } from 'lucide-react';
import { BlockSegmentView } from '../chat/AssistantBlocks';
import { computeBlockSegments, segmentKey } from '../chat/block-segments';
import { useStreamReplay } from '../../hooks/useStreamReplay';
import type { ContentBlock } from '../../types/chat';
import type { RunningAgent } from '../../types/orchestrator';

interface Props {
  agent: RunningAgent | null;
  issueId: string | null;
  blocks: ContentBlock[];
  onClose: () => void;
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const minutes = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${minutes}m ${remSecs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function AgentStreamDrawer({ agent, issueId, blocks, onClose }: Props) {
  const { manifest, recordedBlocks, loading } = useStreamReplay(issueId);

  // Merge recorded history with live blocks, avoiding duplicates at the join
  const mergedBlocks = useMemo(() => {
    if (recordedBlocks.length === 0) return blocks;
    if (blocks.length === 0) return recordedBlocks;
    // Use recorded as base, append live blocks (live events start after recording)
    return [...recordedBlocks, ...blocks];
  }, [recordedBlocks, blocks]);

  const isLive = agent != null;
  const attemptStats = manifest?.attempts[manifest.attempts.length - 1]?.stats;

  const segments = useMemo(
    () => computeBlockSegments(mergedBlocks, isLive),
    [mergedBlocks, isLive]
  );

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const rafRef = useRef(0);

  useEffect(() => {
    if (isLive && atBottom && segments.length > 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: segments.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      });
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isLive, atBottom, segments]);

  const scrollToTop = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 0,
      align: 'start',
      behavior: 'smooth',
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: segments.length - 1,
      align: 'end',
      behavior: 'smooth',
    });
  }, [segments.length]);

  return (
    <AnimatePresence>
      {(agent || issueId) && (
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
              className="pointer-events-auto flex flex-col w-full max-w-[1400px] h-full max-h-[85vh] rounded-2xl border border-white/[0.12] bg-[#1a1a1f]/95 backdrop-blur-3xl shadow-[0_25px_80px_-12px_rgba(0,0,0,0.9),0_0_60px_-10px_rgba(16,185,129,0.12)] ring-1 ring-white/[0.06] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.2)] ${isLive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}
                  >
                    {isLive ? <Radio size={18} /> : <History size={18} />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold tracking-tight text-white truncate">
                      {agent?.issue?.title ??
                        agent?.identifier ??
                        manifest?.identifier ??
                        'Session'}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-muted">
                      {isLive ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Stream
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          Recorded Stream
                        </>
                      )}
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
                            {agent?.identifier ?? manifest?.identifier ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Phase</span>
                          <span className="text-emerald-400 font-medium">
                            {agent?.phase ?? (attemptStats ? 'Completed' : '-')}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Backend</span>
                          <span className="text-blue-400">
                            {agent?.session?.backendName ?? '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {agent?.issue?.description && (
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">
                          Description
                        </h3>
                        <p className="text-sm leading-relaxed text-gray-300">
                          {agent.issue.description}
                        </p>
                      </div>
                    )}

                    {(agent?.session || attemptStats) && (
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-1.5">
                          <Zap size={12} />
                          Session Stats
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center">
                            <span className="block text-lg font-bold text-white">
                              {agent?.session?.turnCount ?? attemptStats?.turnCount ?? 0}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Turns
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="block text-lg font-bold text-white">
                              {formatTokens(
                                agent?.session?.totalTokens ??
                                  (attemptStats?.inputTokens ?? 0) +
                                    (attemptStats?.outputTokens ?? 0)
                              )}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Tokens
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="block text-lg font-bold text-emerald-400">
                              {formatTokens(
                                agent?.session?.inputTokens ?? attemptStats?.inputTokens ?? 0
                              )}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-gray-500">
                              Input
                            </span>
                          </div>
                          <div className="text-center">
                            <span className="block text-lg font-bold text-blue-400">
                              {formatTokens(
                                agent?.session?.outputTokens ?? attemptStats?.outputTokens ?? 0
                              )}
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
                      {isLive ? (
                        <span>Running for {formatDuration(agent!.startedAt)}</span>
                      ) : attemptStats?.durationMs ? (
                        <span>Duration: {Math.round(attemptStats.durationMs / 1000)}s</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Stream body */}
                <div className="flex-1 overflow-hidden relative">
                  <AnimatePresence>
                    {!atTop && segments.length > 5 && (
                      <motion.button
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={scrollToTop}
                        className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-neutral-muted hover:bg-white/10 hover:text-white transition-all shadow-lg"
                        title="Jump to top"
                      >
                        <ChevronUp size={18} />
                      </motion.button>
                    )}

                    {!atBottom && segments.length > 5 && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        onClick={scrollToBottom}
                        className="absolute bottom-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/80 backdrop-blur-md border border-white/20 text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
                        title="Jump to bottom"
                      >
                        <ChevronDown size={18} />
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                      <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="mb-3 flex gap-1"
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      </motion.div>
                      <p className="text-xs text-gray-500">Loading recorded stream...</p>
                    </div>
                  ) : mergedBlocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
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
                    <Virtuoso
                      ref={virtuosoRef}
                      style={{ height: '100%' }}
                      data={segments}
                      followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
                      atBottomStateChange={setAtBottom}
                      atTopStateChange={setAtTop}
                      atBottomThreshold={200}
                      initialTopMostItemIndex={Math.max(0, segments.length - 1)}
                      computeItemKey={(_, segment) => segmentKey(segment)}
                      itemContent={(_, segment) => (
                        <div className="px-6 py-1">
                          <BlockSegmentView segment={segment} isStreaming={isLive} />
                        </div>
                      )}
                    />
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
