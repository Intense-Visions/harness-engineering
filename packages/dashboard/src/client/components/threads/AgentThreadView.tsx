import { useMemo, useContext, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import { MessageStream } from '../chat/MessageStream';
import { NeuralOrganism } from '../chat/NeuralOrganism';
import { AgentEventsContext } from '../layout/ChatLayout';
import { useStreamReplay } from '../../hooks/useStreamReplay';
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket';
import { useThreadStore } from '../../stores/threadStore';
import type { Thread, AgentMeta } from '../../types/thread';
import type { ChatMessage, ContentBlock } from '../../types/chat';
import type { AgentStats } from '../panel/AgentStatsSection';

interface Props {
  thread: Thread;
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

  // Push agent stats to the right-side ContextPanel
  useEffect(() => {
    const attemptDuration = lastAttempt?.stats?.durationMs ?? null;
    const agentStats: AgentStats = {
      identifier: meta.identifier,
      phase: meta.phase,
      backendName: session?.backendName ?? meta.backendName,
      description: meta.issueDescription ?? null,
      turnCount: session?.turnCount ?? lastAttempt?.stats?.turnCount ?? 0,
      inputTokens: session?.inputTokens ?? lastAttempt?.stats?.inputTokens ?? 0,
      outputTokens: session?.outputTokens ?? lastAttempt?.stats?.outputTokens ?? 0,
      totalTokens:
        session?.totalTokens ??
        (lastAttempt?.stats ? lastAttempt.stats.inputTokens + lastAttempt.stats.outputTokens : 0),
      startedAt: meta.startedAt ? new Date(meta.startedAt).getTime() : null,
      durationMs: attemptDuration,
      isRunning,
      pr: manifest?.pr ? { number: manifest.pr.number, status: manifest.pr.status } : null,
    };

    useThreadStore.getState().updatePanelState(thread.id, {
      phase: meta.phase,
      skill: meta.backendName,
      startedAt: meta.startedAt ? new Date(meta.startedAt).getTime() : null,
      agentStats,
    });
  }, [meta, session, lastAttempt, manifest, thread.id, isRunning]);

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

      {/* Description (if present) */}
      {meta.issueDescription && (
        <div className="border-b border-white/[0.06] px-6 py-3 flex-shrink-0">
          <p className="text-xs text-neutral-muted leading-relaxed line-clamp-3">
            {meta.issueDescription}
          </p>
        </div>
      )}

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
