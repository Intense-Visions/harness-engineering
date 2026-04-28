import { useMemo, useContext, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Clock, Cpu, ArrowUpDown, RotateCw } from 'lucide-react';
import { MessageStream } from '../chat/MessageStream';
import { NeuralOrganism } from '../chat/NeuralOrganism';
import { AgentEventsContext } from '../layout/ChatLayout';
import { useStreamReplay } from '../../hooks/useStreamReplay';
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket';
import { useThreadStore } from '../../stores/threadStore';
import type { Thread, AgentMeta } from '../../types/thread';
import type { ChatMessage, ContentBlock } from '../../types/chat';

interface Props {
  thread: Thread;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function AgentThreadView({ thread }: Props) {
  const meta = thread.meta as AgentMeta;
  const agentEventsMap = useContext(AgentEventsContext);
  const liveBlocks = agentEventsMap[meta.issueId] ?? [];

  // Load historical stream data
  const { recordedBlocks, manifest, loading } = useStreamReplay(meta.issueId);

  // Get live session stats from the orchestrator snapshot
  const { snapshot } = useOrchestratorSocket();
  const runningAgent = useMemo(() => {
    if (!snapshot) return null;
    const entry = snapshot.running.find(([id]) => id === meta.issueId);
    return entry ? entry[1] : null;
  }, [snapshot, meta.issueId]);

  const session = runningAgent?.session ?? null;
  const lastAttempt = manifest?.attempts.at(-1) ?? null;

  // Merge: use recorded history as base, append live events on top
  const allBlocks: ContentBlock[] = useMemo(() => {
    if (recordedBlocks.length > 0 && liveBlocks.length > 0) {
      return [...recordedBlocks, ...liveBlocks];
    }
    if (recordedBlocks.length > 0) return recordedBlocks;
    return liveBlocks;
  }, [recordedBlocks, liveBlocks]);

  const messages: ChatMessage[] = useMemo(() => {
    if (allBlocks.length === 0) return [];
    return [{ role: 'assistant' as const, blocks: allBlocks }];
  }, [allBlocks]);

  const isRunning = thread.status === 'active';

  // Update panel state with agent stats
  useEffect(() => {
    const stats =
      session ??
      (lastAttempt?.stats
        ? {
            backendName: meta.backendName ?? 'unknown',
            inputTokens: lastAttempt.stats.inputTokens,
            outputTokens: lastAttempt.stats.outputTokens,
            totalTokens: lastAttempt.stats.inputTokens + lastAttempt.stats.outputTokens,
            turnCount: lastAttempt.stats.turnCount,
            lastMessage: null,
          }
        : null);

    if (stats || meta.issueDescription) {
      useThreadStore.getState().updatePanelState(thread.id, {
        phase: meta.phase,
        skill: meta.backendName,
        startedAt: meta.startedAt ? new Date(meta.startedAt).getTime() : null,
      });
    }
  }, [meta, session, lastAttempt, thread.id]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Agent header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-3 flex-shrink-0">
        <NeuralOrganism size={32} growthDuration={5} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white truncate">{thread.title}</h2>
          <div className="flex items-center gap-3 text-[10px] text-neutral-muted">
            <span className="font-mono truncate">{meta.identifier}</span>
            <span className="flex items-center gap-1">
              <Bot size={10} />
              {meta.phase}
            </span>
          </div>
        </div>
        {isRunning ? (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-semantic-success"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
            Running
          </motion.div>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-muted">
            Completed
          </span>
        )}
      </div>

      {/* Description + stats bar */}
      <div className="border-b border-white/[0.06] px-6 py-3 flex-shrink-0 space-y-2">
        {meta.issueDescription && (
          <p className="text-xs text-neutral-muted leading-relaxed line-clamp-3">
            {meta.issueDescription}
          </p>
        )}
        <div className="flex items-center gap-4 text-[10px]">
          {(session?.backendName || meta.backendName) && (
            <span className="flex items-center gap-1 text-neutral-muted">
              <Cpu size={10} />
              <span className="text-primary-500 font-mono">
                {session?.backendName ?? meta.backendName}
              </span>
            </span>
          )}
          {session && (
            <>
              <span className="flex items-center gap-1 text-neutral-muted">
                <ArrowUpDown size={10} />
                <span className="text-neutral-text">
                  {formatNumber(session.inputTokens)} / {formatNumber(session.outputTokens)}
                </span>
                <span className="text-neutral-muted/60">tok</span>
              </span>
              <span className="flex items-center gap-1 text-neutral-muted">
                <RotateCw size={10} />
                <span className="text-neutral-text">T{session.turnCount}</span>
              </span>
            </>
          )}
          {!session && lastAttempt?.stats && (
            <>
              <span className="flex items-center gap-1 text-neutral-muted">
                <ArrowUpDown size={10} />
                <span className="text-neutral-text">
                  {formatNumber(lastAttempt.stats.inputTokens)} /{' '}
                  {formatNumber(lastAttempt.stats.outputTokens)}
                </span>
                <span className="text-neutral-muted/60">tok</span>
              </span>
              <span className="flex items-center gap-1 text-neutral-muted">
                <RotateCw size={10} />
                <span className="text-neutral-text">T{lastAttempt.stats.turnCount}</span>
              </span>
            </>
          )}
          {meta.startedAt && (
            <span className="flex items-center gap-1 text-neutral-muted">
              <Clock size={10} />
              <span className="text-neutral-text">{formatElapsed(meta.startedAt)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Message stream */}
      <div className="flex-1 min-h-0 p-4">
        {loading ? (
          <div className="flex flex-1 items-center justify-center h-full">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-xs text-neutral-muted"
            >
              Loading stream history...
            </motion.div>
          </div>
        ) : messages.length > 0 ? (
          <MessageStream messages={messages} streaming={isRunning} />
        ) : (
          <div className="flex flex-1 items-center justify-center h-full">
            <div className="text-center">
              <NeuralOrganism size={60} growthDuration={10} />
              <p className="mt-4 text-xs text-neutral-muted">
                {isRunning ? 'Agent is working...' : 'No activity recorded for this session.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
