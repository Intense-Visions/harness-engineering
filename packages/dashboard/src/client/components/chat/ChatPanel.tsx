import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Loader2, Sparkles, X, Save, ArrowLeft } from 'lucide-react';
import { MessageStream } from './MessageStream';
import { ChatInput } from './ChatInput';
import { CommandPalette } from './CommandPalette';
import { ChatContextPane } from './ChatContextPane';
import { SessionTabBar } from './SessionTabBar';
import { streamChat, applyChunk } from '../../utils/chat-stream';
import { useChatContext } from '../../hooks/useChatContext';
import { useChatPanel } from '../../hooks/useChatPanel';
import { generateSystemPrompt } from '../../utils/context-to-prompt';
import { SKILL_REGISTRY } from '../../constants/skills';
import type { ChatMessage, UserMessage, AssistantMessage, TextBlock } from '../../types/chat';
import type { SkillEntry } from '../../types/skills';
import type { PendingInteraction } from '../../types/orchestrator';

interface Props {
  isOpen: boolean;
  onClose?: () => void;
  maximized?: boolean;
}

function buildInteractionSystemPrompt(interaction: PendingInteraction): string {
  const { context, reasons } = interaction;
  const parts: string[] = [
    `You are helping a human engineer reason through a complex issue that was escalated from the orchestrator.`,
    ``,
    `## Issue: ${context.issueTitle}`,
  ];

  if (context.issueDescription) {
    parts.push(``, `## Description`, context.issueDescription);
  }

  if (reasons.length > 0) {
    parts.push(``, `## Escalation Reasons`, ...reasons.map((r) => `- ${r}`));
  }

  if (context.specPath) {
    parts.push(``, `## Spec`, `Available at: ${context.specPath}`);
  }

  if (context.relatedFiles.length > 0) {
    parts.push(``, `## Related Files`, ...context.relatedFiles.map((f) => `- ${f}`));
  }

  parts.push(
    ``,
    `## Instructions`,
    `Help the human brainstorm and produce a plan. When the human is satisfied with the plan, they will save it using the "Save Plan" button. The plan should be written in markdown and follow the project's existing plan format in docs/plans/.`
  );

  return parts.join('\n');
}

export function ChatPanel({ isOpen, onClose, maximized = false }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const commandParam = searchParams.get('command');
  const interactionIdParam = searchParams.get('interactionId');

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    updateSession,
    createNewSession,
    closeSession,
    renameSession,
  } = useChatPanel();

  const activeSession = useMemo(
    () => sessions.find((s) => s.sessionId === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  // Guards against double-fires (React strict mode, dep changes)
  const autoExecutedRef = useRef(new Set<string>());
  const processedCommandRef = useRef<string | null>(null);
  const processedInteractionRef = useRef<string | null>(null);

  // Interaction state
  const [interaction, setInteraction] = useState<PendingInteraction | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync local input with active session's unsent input
  useEffect(() => {
    if (activeSession) {
      setInput(activeSession.input || '');
    } else {
      setInput('');
    }
  }, [activeSessionId, activeSession]);

  // Handle deep-links: ?command=harness:security-scan
  useEffect(() => {
    if (!isOpen || !commandParam) return;
    if (commandParam === processedCommandRef.current) return;

    const skill = SKILL_REGISTRY.find(
      (s) => s.id === commandParam || s.slashCommand === commandParam
    );
    if (!skill) return;

    processedCommandRef.current = commandParam;
    createNewSession({ command: skill.id });
    setSelectedSkill(skill);

    const next = new URLSearchParams(searchParams);
    next.delete('command');
    setSearchParams(next, { replace: true });
  }, [isOpen, commandParam, createNewSession, searchParams, setSearchParams]);

  // Handle interactionId Param
  useEffect(() => {
    if (!isOpen || !interactionIdParam) return;
    if (interactionIdParam === processedInteractionRef.current) return;
    processedInteractionRef.current = interactionIdParam;

    const existing = sessions.find((s) => s.interactionId === interactionIdParam);
    if (existing) {
      setActiveSessionId(existing.sessionId);
    } else {
      fetch('/api/interactions')
        .then((res) => res.json())
        .then((all: PendingInteraction[]) => {
          const found = all.find((i) => i.id === interactionIdParam);
          if (found) {
            createNewSession({
              interactionId: found.id,
              label: found.context.issueTitle,
              command: 'harness:interaction',
            });

            if (found.status === 'pending') {
              fetch(`/api/interactions/${found.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'claimed' }),
              });
            }
          }
        });
    }

    const next = new URLSearchParams(searchParams);
    next.delete('interactionId');
    setSearchParams(next, { replace: true });
  }, [
    isOpen,
    interactionIdParam,
    sessions,
    setActiveSessionId,
    createNewSession,
    searchParams,
    setSearchParams,
  ]);

  // Fetch interaction details if active session has interactionId
  useEffect(() => {
    if (activeSession?.interactionId) {
      fetch('/api/interactions')
        .then((res) => res.json())
        .then((all: PendingInteraction[]) => {
          const found = all.find((i) => i.id === activeSession.interactionId);
          if (found) setInteraction(found);
        });
    } else {
      setInteraction(null);
    }
    setSaveSuccess(false);
    setSaveError(null);
  }, [activeSession?.interactionId]);

  // Hook for route-aware/skill-aware data fetching
  const context = useChatContext(
    selectedSkill?.contextSources || activeSession?.command
      ? SKILL_REGISTRY.find((s) => s.id === (selectedSkill?.id || activeSession?.command))
          ?.contextSources
      : undefined
  );

  // Resolve the skill to display in context pane (persists after execution)
  const displayedSkill = useMemo(() => {
    if (selectedSkill) return selectedSkill;
    if (activeSession?.command && activeSession.command !== 'harness:interaction') {
      return SKILL_REGISTRY.find((s) => s.id === activeSession.command) ?? null;
    }
    return null;
  }, [selectedSkill, activeSession?.command]);

  const hasContextPane = interaction != null || displayedSkill != null;

  const handleSend = useCallback(
    async (overridePrompt?: string, overrideSystemPrompt?: string) => {
      const promptText = (overridePrompt ?? input).trim();
      if (!promptText || streaming) return;

      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        targetSessionId = createNewSession();
      }

      const targetSession = sessions.find((s) => s.sessionId === targetSessionId);
      const currentMessages = targetSession?.messages || [];
      const isFirstTurn = currentMessages.length === 0;

      let systemPrompt = overrideSystemPrompt;
      if (isFirstTurn && !systemPrompt && interaction) {
        systemPrompt = buildInteractionSystemPrompt(interaction);
      }

      const userMessage: UserMessage = { role: 'user', content: promptText };
      updateSession(targetSessionId, {
        messages: [...currentMessages, userMessage, { role: 'assistant', blocks: [] }],
        lastActiveAt: new Date().toISOString(),
        input: '',
      });

      setInput('');
      setStreaming(true);
      setChatError(null);

      // On first turn, omit sessionId so the orchestrator creates a new Claude
      // Code session (--session-id <new>). Sending a local UUID would cause it
      // to --resume a non-existent session, producing an empty response.
      const orchestratorSid = isFirstTurn ? undefined : targetSession?.orchestratorSessionId;

      const controller = new AbortController();
      await streamChat(
        promptText,
        systemPrompt,
        orchestratorSid,
        {
          onSession: (sid) => {
            updateSession(targetSessionId!, { orchestratorSessionId: sid });
          },
          onChunk: (event) => {
            updateSession(targetSessionId!, (session) => ({
              messages: session.messages.map((msg, idx, arr) => {
                if (idx === arr.length - 1 && msg.role === 'assistant') {
                  const blocks = [...msg.blocks];
                  applyChunk(blocks, event);
                  return { ...msg, blocks };
                }
                return msg;
              }),
            }));
          },
          onDone: () => setStreaming(false),
          onError: (error) => {
            setChatError(error);
            updateSession(targetSessionId!, (session) => ({
              messages: session.messages.map((msg, idx, arr) => {
                if (idx === arr.length - 1 && msg.role === 'assistant') {
                  return {
                    ...msg,
                    blocks: [...msg.blocks, { kind: 'text', text: `**Error:** ${error}` }],
                  };
                }
                return msg;
              }),
            }));
            setStreaming(false);
          },
        },
        controller.signal
      );
    },
    [input, streaming, activeSessionId, createNewSession, updateSession, sessions, interaction]
  );

  const handleExecuteSkill = useCallback(() => {
    if (!selectedSkill) return;
    const systemPrompt = generateSystemPrompt(selectedSkill, context.data);
    void handleSend(selectedSkill.slashCommand, systemPrompt);
    setSelectedSkill(null);
  }, [selectedSkill, context.data, handleSend]);

  // Auto-start brainstorm for claimed interaction sessions
  useEffect(() => {
    if (
      interaction &&
      activeSession?.interactionId &&
      activeSession.messages.length === 0 &&
      !streaming &&
      !autoExecutedRef.current.has(activeSession.sessionId)
    ) {
      autoExecutedRef.current.add(activeSession.sessionId);
      void handleSend(
        'Analyze this escalated issue and help me brainstorm an implementation approach.',
        buildInteractionSystemPrompt(interaction)
      );
    }
  }, [interaction, activeSession, streaming, handleSend]);

  // Auto-execute skill for command deep-links (e.g. Health "Fix It")
  useEffect(() => {
    if (
      selectedSkill &&
      activeSession &&
      activeSession.messages.length === 0 &&
      !streaming &&
      !context.isLoading &&
      !autoExecutedRef.current.has(activeSession.sessionId)
    ) {
      autoExecutedRef.current.add(activeSession.sessionId);
      handleExecuteSkill();
    }
  }, [selectedSkill, activeSession, streaming, context.isLoading, handleExecuteSkill]);

  const handleSkillSelect = useCallback(
    (skill: SkillEntry) => {
      setSelectedSkill(skill);
      // Always create a fresh session — activeSessionId may be stale (persisted
      // in localStorage but no longer present in the sessions array, e.g. after
      // the orchestrator restarts). Updating a non-existent session is a no-op
      // which silently prevents skill execution.
      createNewSession({ command: skill.id });
    },
    [createNewSession]
  );

  const handleInputChange = (val: string) => {
    setInput(val);
    if (activeSessionId) {
      updateSession(activeSessionId, { input: val });
    }
  };

  const handleSavePlan = useCallback(async () => {
    if (!interaction || !activeSession) return;

    const lastAssistant = [...activeSession.messages]
      .reverse()
      .find((m): m is AssistantMessage => m.role === 'assistant');
    const planContent = lastAssistant?.blocks
      .filter((b): b is TextBlock => b.kind === 'text')
      .map((b) => b.text)
      .join('\n\n');
    if (!planContent) return;

    setSavingPlan(true);
    setSaveError(null);

    try {
      const date = new Date().toISOString().slice(0, 10);
      const slug = interaction.issueId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const filename = `${date}-${slug}-plan.md`;

      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: planContent }),
      });

      if (!res.ok) {
        const body = await res.json();
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      await fetch(`/api/interactions/${interaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      setSaveSuccess(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSavingPlan(false);
    }
  }, [interaction, activeSession]);

  /* ── Shared dialog content ─────────────────────────────────── */

  const dialogContent = (
    <>
      {/* Header */}
      <div className="flex flex-col border-b border-white/10 flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {maximized && (
              <button
                onClick={() => navigate('/orchestrator/attention')}
                className="mr-2 rounded-full p-2 text-neutral-muted hover:bg-white/5 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500 shadow-[0_0_15px_rgba(79,70,229,0.2)]">
              <Cpu size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white">
                {interaction ? interaction.context.issueTitle : 'Neural Uplink'}
              </h3>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-neutral-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {activeSessionId ? 'Direct Connection Active' : 'Standby Mode'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {interaction && activeSession && activeSession.messages.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSavePlan}
                disabled={savingPlan || streaming}
                className={[
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all',
                  saveSuccess
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-primary-500 text-white shadow-[0_0_10px_rgba(79,70,229,0.3)]',
                  (savingPlan || streaming) && !saveSuccess ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {saveSuccess ? <Sparkles size={12} /> : <Save size={12} />}
                {savingPlan ? 'Saving...' : saveSuccess ? 'Plan Saved' : 'Save Plan'}
              </motion.button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-muted hover:bg-white/5 hover:text-white transition-all"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <SessionTabBar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onNew={() => {
            setSelectedSkill(null);
            createNewSession();
          }}
          onClose={closeSession}
          onRename={renameSession}
        />
      </div>

      {saveError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2 flex-shrink-0">
          <p className="text-[10px] font-mono text-red-400">{saveError}</p>
        </div>
      )}
      {chatError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2 flex-shrink-0 flex items-center justify-between">
          <p className="text-[10px] font-mono text-red-400">Connection failed: {chatError}</p>
          <button
            onClick={() => setChatError(null)}
            className="text-red-400/60 hover:text-red-400 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content: context pane (left) + chat (right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Context Pane */}
        {hasContextPane && (
          <div className="w-[400px] flex-shrink-0 border-r border-white/10 bg-black/20">
            <ChatContextPane interaction={interaction} skill={displayedSkill} context={context} />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Loading indicator while auto-execute prepares */}
          {selectedSkill && (!activeSession || activeSession.messages.length === 0) && (
            <div className="border-b border-white/10 px-6 py-3 flex items-center gap-3 bg-primary-500/5 flex-shrink-0">
              <Loader2 size={14} className="animate-spin text-primary-400" />
              <p className="text-sm text-gray-400">
                Starting <span className="text-white font-medium">{selectedSkill.name}</span>...
              </p>
            </div>
          )}

          {/* Messages / Command Palette */}
          <div className="flex-1 overflow-hidden">
            {(!activeSession || activeSession.messages.length === 0) && !selectedSkill ? (
              <div className="p-4 h-full">
                <CommandPalette onSelect={handleSkillSelect} />
              </div>
            ) : (
              <div className="p-4 h-full">
                <MessageStream
                  messages={activeSession?.messages || []}
                  streaming={streaming}
                  className="rounded-xl border-none bg-transparent shadow-none"
                />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-4 flex-shrink-0">
            <ChatInput
              value={input}
              onChange={handleInputChange}
              onSend={() => handleSend()}
              disabled={streaming}
              placeholder={activeSessionId ? 'Ask anything...' : 'Select a skill to begin...'}
            />
          </div>
        </div>
      </div>
    </>
  );

  /* ── Maximized: full-screen (from /orchestrator/chat route) ── */

  if (maximized) {
    return (
      <div className="flex flex-col h-full w-full border border-white/[0.12] bg-[#1a1a1f]/95 backdrop-blur-3xl">
        {dialogContent}
      </div>
    );
  }

  /* ── Standard: centered dialog overlay ──────────────────────── */

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="chat-dialog"
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
              className="pointer-events-auto flex flex-col w-full max-w-[1400px] h-full max-h-[85vh] rounded-2xl border border-white/[0.12] bg-[#1a1a1f]/95 backdrop-blur-3xl shadow-[0_25px_80px_-12px_rgba(0,0,0,0.9),0_0_60px_-10px_rgba(79,70,229,0.12)] ring-1 ring-white/[0.06] overflow-hidden"
            >
              {dialogContent}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
