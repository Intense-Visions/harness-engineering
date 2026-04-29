import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MessageStream } from '../chat/MessageStream';
import { ChatInput } from '../chat/ChatInput';
import { BriefingCard } from '../cards/BriefingCard';
import { streamChat, applyChunk } from '../../utils/chat-stream';
import { useThreadStore } from '../../stores/threadStore';
import type { Thread, AttentionMeta } from '../../types/thread';
import type { UserMessage, AssistantMessage, ChatMessage } from '../../types/chat';
import type { PendingInteraction } from '../../types/orchestrator';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface Props {
  thread: Thread;
}

function buildInteractionSystemPrompt(interaction: PendingInteraction): string {
  const { context, reasons } = interaction;
  const parts: string[] = [
    `You are helping a human engineer reason through a complex issue that was escalated from the orchestrator.`,
    ``,
    `## Issue: ${context.issueTitle}`,
  ];
  if (context.issueDescription) parts.push(``, `## Description`, context.issueDescription);
  if (reasons.length > 0) parts.push(``, `## Escalation Reasons`, ...reasons.map((r) => `- ${r}`));
  if (context.specPath) parts.push(``, `## Spec`, `Available at: ${context.specPath}`);
  if (context.relatedFiles.length > 0)
    parts.push(``, `## Related Files`, ...context.relatedFiles.map((f) => `- ${f}`));
  parts.push(
    ``,
    `## Instructions`,
    `Help the human brainstorm and produce a plan. When the human is satisfied with the plan, they will save it using the "Save Plan" button.`
  );
  return parts.join('\n');
}

export function AttentionThreadView({ thread }: Props) {
  const meta = thread.meta as AttentionMeta;
  const storeApi = useThreadStore;
  const messages = storeApi((s) => s.messages.get(thread.id) ?? EMPTY_MESSAGES);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | undefined>();
  const [interaction, setInteraction] = useState<PendingInteraction | null>(null);
  const [claimed, setClaimed] = useState(thread.status === 'active');
  const autoExecutedRef = useRef(false);

  // Fetch the interaction details
  useEffect(() => {
    fetch('/api/interactions')
      .then((res) => res.json())
      .then((all: PendingInteraction[]) => {
        const found = all.find((i) => i.id === meta.interactionId);
        if (found) {
          setInteraction(found);
          // Update thread title with issue title
          if (found.context.issueTitle && thread.title.startsWith('Attention:')) {
            storeApi.getState().updateThread(thread.id, { title: found.context.issueTitle });
          }
        }
      })
      .catch(() => {});
  }, [meta.interactionId, thread.id, thread.title]);

  const handleClaim = useCallback(() => {
    storeApi.getState().claimThread(thread.id);
    setClaimed(true);
    // Claim on server
    if (meta.interactionId) {
      fetch(`/api/interactions/${meta.interactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'claimed' }),
      }).catch(() => {});
    }
  }, [thread.id, meta.interactionId]);

  const handleDismiss = useCallback(() => {
    storeApi.getState().dismissThread(thread.id);
    if (meta.interactionId) {
      fetch(`/api/interactions/${meta.interactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      }).catch(() => {});
    }
  }, [thread.id, meta.interactionId]);

  const handleSend = useCallback(
    async (overridePrompt?: string, overrideSystemPrompt?: string) => {
      const promptText = (overridePrompt ?? input).trim();
      if (!promptText || streaming) return;

      // Auto-claim on first message
      if (!claimed) handleClaim();

      const isFirstTurn = messages.length === 0;
      const userMessage: UserMessage = { role: 'user', content: promptText };
      const assistantMessage: AssistantMessage = { role: 'assistant', blocks: [] };

      storeApi.getState().appendMessage(thread.id, userMessage);
      storeApi.getState().appendMessage(thread.id, assistantMessage);
      setInput('');
      setStreaming(true);

      let systemPrompt = overrideSystemPrompt;
      if (isFirstTurn && !systemPrompt && interaction) {
        systemPrompt = buildInteractionSystemPrompt(interaction);
      }

      const sidForStream = isFirstTurn ? undefined : orchestratorSessionId;

      const controller = new AbortController();
      await streamChat(
        promptText,
        systemPrompt,
        sidForStream,
        {
          onSession: (sid) => setOrchestratorSessionId(sid),
          onChunk: (event) => {
            storeApi.getState().updateLastMessage(thread.id, (msg) => {
              if (msg.role !== 'assistant') return msg;
              const blocks = [...msg.blocks];
              applyChunk(blocks, event);
              return { ...msg, blocks };
            });
          },
          onDone: () => setStreaming(false),
          onError: (error) => {
            storeApi.getState().updateLastMessage(thread.id, (msg) => {
              if (msg.role !== 'assistant') return msg;
              return {
                ...msg,
                blocks: [...msg.blocks, { kind: 'text', text: `**Error:** ${error}` }],
              };
            });
            setStreaming(false);
          },
        },
        controller.signal
      );
    },
    [
      input,
      streaming,
      claimed,
      messages.length,
      interaction,
      orchestratorSessionId,
      handleClaim,
      thread.id,
    ]
  );

  // Auto-start brainstorm after claiming
  useEffect(() => {
    if (claimed && interaction && messages.length === 0 && !streaming && !autoExecutedRef.current) {
      autoExecutedRef.current = true;
      void handleSend(
        'Analyze this escalated issue and help me brainstorm an implementation approach.',
        buildInteractionSystemPrompt(interaction)
      );
    }
  }, [claimed, interaction, messages.length, streaming, handleSend]);

  if (!interaction) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-xs text-neutral-muted"
        >
          Loading interaction...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Briefing card — collapsible */}
      <BriefingCard
        interaction={interaction}
        collapsed={claimed}
        onClaim={handleClaim}
        onDismiss={handleDismiss}
      />

      {/* Message stream */}
      {messages.length > 0 && (
        <div className="flex-1 min-h-0 p-4">
          <MessageStream messages={messages} streaming={streaming} />
        </div>
      )}

      {/* Chat input — visible after claim */}
      {claimed && (
        <div className="flex-shrink-0 border-t border-white/[0.06] px-4 py-3">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => void handleSend()}
            disabled={streaming}
            placeholder="Discuss the escalation..."
          />
        </div>
      )}
    </div>
  );
}
