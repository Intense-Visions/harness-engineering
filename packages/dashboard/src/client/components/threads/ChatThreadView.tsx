import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MessageStream } from '../chat/MessageStream';
import { ChatInput } from '../chat/ChatInput';
import { CommandPalette } from '../chat/CommandPalette';
import { BriefingPanel } from '../chat/BriefingPanel';
import { NeuralOrganism } from '../chat/NeuralOrganism';
import { streamChat, applyChunk } from '../../utils/chat-stream';
import { useChatContext } from '../../hooks/useChatContext';
import { generateSystemPrompt } from '../../utils/context-to-prompt';
import { SKILL_REGISTRY } from '../../constants/skills';
import { useThreadStore } from '../../stores/threadStore';
import { extractTodosFromBlocks } from '../../utils/block-filter';
import type { Thread, ChatMeta } from '../../types/thread';
import type { UserMessage, AssistantMessage, ContentBlock, ChatMessage } from '../../types/chat';
import type { ChatSession } from '../../types/chat-session';
import type { SkillEntry } from '../../types/skills';

const EMPTY_MESSAGES: ChatMessage[] = [];

interface Props {
  thread: Thread;
}

function persistSession(session: ChatSession): void {
  fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  }).catch((err) => console.error('Failed to persist session:', err));
}

export function ChatThreadView({ thread }: Props) {
  const meta = thread.meta as ChatMeta;
  const messages = useThreadStore((s) => s.messages.get(thread.id) ?? EMPTY_MESSAGES);
  const storeApi = useThreadStore;

  // Extract todos from messages and push to context panel
  useEffect(() => {
    const allBlocks: ContentBlock[] = [];
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        allBlocks.push(...msg.blocks);
      }
    }
    const todos = extractTodosFromBlocks(allBlocks);
    if (todos.length > 0) {
      useThreadStore.getState().updatePanelState(thread.id, { todos });
    }
  }, [messages, thread.id]);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | undefined>();
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [showBriefing, setShowBriefing] = useState(false);

  const autoExecutedRef = useRef(new Set<string>());
  const pendingCommandArgsRef = useRef<string | null>(null);

  // Load existing session messages on cold-mount only.
  // If the store already has messages for this thread (e.g. user navigated away
  // within the SPA and came back), skip the fetch — the in-memory state is
  // newer than the server snapshot, which lags behind streaming replies.
  useEffect(() => {
    const existing = storeApi.getState().messages.get(thread.id);
    if (existing && existing.length > 0) return;

    fetch(`/api/sessions/${meta.sessionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((session: ChatSession | null) => {
        if (session && Array.isArray(session.messages)) {
          storeApi.getState().setMessages(thread.id, session.messages);
          if (session.orchestratorSessionId) {
            setOrchestratorSessionId(session.orchestratorSessionId);
          }
        }
      })
      .catch(() => {
        // Session doesn't exist on server yet — that's fine for new threads
      });
  }, [meta.sessionId, thread.id, storeApi]);

  // If thread was created with a command, resolve the skill
  useEffect(() => {
    if (meta.command && !selectedSkill) {
      const skill = SKILL_REGISTRY.find(
        (s) => s.id === meta.command || s.slashCommand === meta.command
      );
      if (skill) {
        setSelectedSkill(skill);
        setShowBriefing(true);
      }
    }
  }, [meta.command, selectedSkill]);

  const displayedSkill = useMemo(() => {
    if (selectedSkill) return selectedSkill;
    if (meta.command) {
      return SKILL_REGISTRY.find((s) => s.id === meta.command) ?? null;
    }
    return null;
  }, [selectedSkill, meta.command]);

  const context = useChatContext(displayedSkill?.contextSources);

  const handleSend = useCallback(
    async (overridePrompt?: string, overrideSystemPrompt?: string) => {
      const promptText = (overridePrompt ?? input).trim();
      if (!promptText || streaming) return;

      const isFirstTurn = messages.length === 0;

      const userMessage: UserMessage = { role: 'user', content: promptText };
      const assistantMessage: AssistantMessage = { role: 'assistant', blocks: [] };

      storeApi.getState().appendMessage(thread.id, userMessage);
      storeApi.getState().appendMessage(thread.id, assistantMessage);
      setInput('');
      setStreaming(true);
      setChatError(null);

      // Persist the session with the new messages
      const updatedSession: ChatSession = {
        sessionId: meta.sessionId,
        ...(orchestratorSessionId ? { orchestratorSessionId } : {}),
        command: meta.command,
        interactionId: null,
        label: thread.title,
        createdAt: new Date(thread.createdAt).toISOString(),
        lastActiveAt: new Date().toISOString(),
        artifacts: [],
        status: 'active',
        messages: [...messages, userMessage, assistantMessage],
        input: '',
      };
      persistSession(updatedSession);

      const sidForStream = isFirstTurn ? undefined : orchestratorSessionId;

      const controller = new AbortController();
      await streamChat(
        promptText,
        overrideSystemPrompt,
        sidForStream,
        {
          onSession: (sid) => {
            setOrchestratorSessionId(sid);
          },
          onChunk: (event) => {
            storeApi.getState().updateLastMessage(thread.id, (msg) => {
              if (msg.role !== 'assistant') return msg;
              const blocks = [...msg.blocks];
              applyChunk(blocks, event);
              return { ...msg, blocks };
            });
          },
          onDone: () => {
            setStreaming(false);
            // Update thread title from first user message if it's "New Chat"
            if (thread.title === 'New Chat' && promptText.length > 0) {
              const shortTitle =
                promptText.length > 50 ? promptText.slice(0, 47) + '...' : promptText;
              storeApi.getState().updateThread(thread.id, { title: shortTitle });
            }
          },
          onError: (error) => {
            setChatError(error);
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
    [input, streaming, messages, meta, orchestratorSessionId, thread]
  );

  const handleExecuteSkill = useCallback(() => {
    if (!selectedSkill) return;
    const systemPrompt = generateSystemPrompt(selectedSkill, context.data);
    const args = pendingCommandArgsRef.current;
    const command = args ? `${selectedSkill.slashCommand} ${args}` : selectedSkill.slashCommand;
    pendingCommandArgsRef.current = null;
    setShowBriefing(false);
    void handleSend(command, systemPrompt);
    setSelectedSkill(null);
  }, [selectedSkill, context.data, handleSend]);

  // Auto-execute for command deep-links
  useEffect(() => {
    if (
      selectedSkill &&
      !showBriefing &&
      messages.length === 0 &&
      !streaming &&
      !context.isLoading &&
      !autoExecutedRef.current.has(meta.sessionId)
    ) {
      autoExecutedRef.current.add(meta.sessionId);
      handleExecuteSkill();
    }
  }, [
    selectedSkill,
    showBriefing,
    messages.length,
    streaming,
    context.isLoading,
    handleExecuteSkill,
    meta.sessionId,
  ]);

  const handleSkillSelect = useCallback(
    (skill: SkillEntry) => {
      setSelectedSkill(skill);
      setShowBriefing(true);
      if (messages.length === 0) {
        storeApi
          .getState()
          .updateThread(thread.id, { title: skill.id.split(':').pop() || 'New Chat' });
      }
    },
    [messages.length, thread.id]
  );

  // Show command palette for empty threads without a command
  if (messages.length === 0 && !selectedSkill && !meta.command) {
    return (
      <div className="flex flex-1 flex-col">
        {/* Thread header area */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <NeuralOrganism size={36} growthDuration={5} />
          <div>
            <h2 className="text-sm font-bold text-white">{thread.title}</h2>
            <p className="text-[10px] text-neutral-muted">Start a conversation or select a skill</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Input at top for quick typing */}
          <div className="px-4 pt-4">
            <ChatInput
              value={input}
              onChange={setInput}
              onSend={() => void handleSend()}
              disabled={streaming}
              placeholder="Type a message or select a skill below..."
            />
          </div>

          {/* Command palette */}
          <div className="flex-1 px-4 py-4">
            <CommandPalette onSelect={handleSkillSelect} />
          </div>
        </div>
      </div>
    );
  }

  // Show briefing panel for skill that hasn't been executed yet
  if (showBriefing && selectedSkill && messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <NeuralOrganism size={36} growthDuration={5} />
          <div>
            <h2 className="text-sm font-bold text-white">{selectedSkill.name}</h2>
            <p className="text-[10px] text-neutral-muted">{selectedSkill.description}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <BriefingPanel
            skill={selectedSkill}
            context={context}
            onExecute={handleExecuteSkill}
            onCancel={() => {
              setSelectedSkill(null);
              setShowBriefing(false);
            }}
          />
        </div>
      </div>
    );
  }

  // Main chat view with MessageStream + Input
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-3 flex-shrink-0">
        <NeuralOrganism size={28} growthDuration={5} />
        <h2 className="text-sm font-bold text-white truncate">{thread.title}</h2>
        {streaming && (
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-[9px] font-bold uppercase tracking-widest text-primary-500"
          >
            Streaming
          </motion.div>
        )}
        {chatError && (
          <span className="text-[9px] font-bold uppercase tracking-widest text-semantic-error">
            Error
          </span>
        )}
      </div>

      {/* Message stream */}
      <div className="flex-1 min-h-0 p-4">
        <MessageStream messages={messages} streaming={streaming} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-white/[0.06] px-4 py-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => void handleSend()}
          disabled={streaming}
          placeholder="Type a message..."
        />
      </div>
    </div>
  );
}
