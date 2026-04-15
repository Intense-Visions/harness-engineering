import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Sparkles, X, Save, ArrowLeft } from 'lucide-react';
import { MessageStream } from './MessageStream';
import { ChatInput } from './ChatInput';
import { CommandPalette } from './CommandPalette';
import { BriefingPanel } from './BriefingPanel';
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
    renameSession
  } = useChatPanel();

  const activeSession = useMemo(() => 
    sessions.find(s => s.sessionId === activeSessionId) || null
  , [sessions, activeSessionId]);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  
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
    if (isOpen && commandParam) {
      const skill = SKILL_REGISTRY.find(s => s.id === commandParam || s.slashCommand === commandParam);
      if (skill) {
        if (sessions.length === 0 || (activeSession && activeSession.messages.length === 0)) {
          if (sessions.length === 0) {
            createNewSession({ command: skill.id });
          }
          setSelectedSkill(skill);
        } else {
          createNewSession({ command: skill.id });
        }
        const next = new URLSearchParams(searchParams);
        next.delete('command');
        setSearchParams(next, { replace: true });
      }
    }
  }, [isOpen, commandParam, sessions.length, activeSession, createNewSession, searchParams, setSearchParams]);

  // Handle interactionId Param
  useEffect(() => {
    if (isOpen && interactionIdParam) {
      // Find if we already have a session for this interaction
      const existing = sessions.find(s => s.interactionId === interactionIdParam);
      if (existing) {
        setActiveSessionId(existing.sessionId);
      } else {
        // Fetch interaction details to seed new session
        fetch('/api/interactions')
          .then(res => res.json())
          .then((all: PendingInteraction[]) => {
            const found = all.find(i => i.id === interactionIdParam);
            if (found) {
              createNewSession({ 
                interactionId: found.id, 
                label: found.context.issueTitle,
                command: 'harness:interaction'
              });
              
              // Claim it if pending
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
    }
  }, [isOpen, interactionIdParam, sessions, setActiveSessionId, createNewSession, searchParams, setSearchParams]);

  // Fetch interaction details if active session has interactionId
  useEffect(() => {
    if (activeSession?.interactionId) {
      fetch('/api/interactions')
        .then(res => res.json())
        .then((all: PendingInteraction[]) => {
          const found = all.find(i => i.id === activeSession.interactionId);
          if (found) setInteraction(found);
        });
    } else {
      setInteraction(null);
    }
    setSaveSuccess(false);
    setSaveError(null);
  }, [activeSession?.interactionId]);

  // Hook for route-aware/skill-aware data fetching
  const context = useChatContext(selectedSkill?.contextSources || activeSession?.command ? SKILL_REGISTRY.find(s => s.id === (selectedSkill?.id || activeSession?.command))?.contextSources : undefined);

  const handleSend = useCallback(async (overridePrompt?: string, overrideSystemPrompt?: string) => {
    const promptText = (overridePrompt ?? input).trim();
    if (!promptText || streaming) return;

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      targetSessionId = createNewSession();
    }

    const currentMessages = sessions.find(s => s.sessionId === targetSessionId)?.messages || [];
    const isFirstTurn = currentMessages.length === 0;
    
    // If it's an interaction and first turn, build its system prompt
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

    const controller = new AbortController();
    await streamChat(
      promptText,
      systemPrompt,
      targetSessionId,
      {
        onSession: () => {},
        onChunk: (event) => {
          updateSession(targetSessionId!, {
            messages: (sessions.find(s => s.sessionId === targetSessionId)?.messages || []).map((msg, idx, arr) => {
              if (idx === arr.length - 1 && msg.role === 'assistant') {
                const blocks = [...msg.blocks];
                applyChunk(blocks, event);
                return { ...msg, blocks };
              }
              return msg;
            })
          });
        },
        onDone: () => setStreaming(false),
        onError: (error) => {
          updateSession(targetSessionId!, {
            messages: (sessions.find(s => s.sessionId === targetSessionId)?.messages || []).map((msg, idx, arr) => {
              if (idx === arr.length - 1 && msg.role === 'assistant') {
                return {
                  ...msg,
                  blocks: [...msg.blocks, { kind: 'text', text: `**Error:** ${error}` }],
                };
              }
              return msg;
            })
          });
          setStreaming(false);
        },
      },
      controller.signal
    );
  }, [input, streaming, activeSessionId, createNewSession, updateSession, sessions, interaction]);

  const handleExecuteSkill = useCallback(() => {
    if (!selectedSkill) return;
    const systemPrompt = generateSystemPrompt(selectedSkill, context.data);
    void handleSend(selectedSkill.slashCommand, systemPrompt);
    setSelectedSkill(null);
  }, [selectedSkill, context.data, handleSend]);

  const handleSkillSelect = useCallback((skill: SkillEntry) => {
    setSelectedSkill(skill);
    if (!activeSessionId) {
      createNewSession({ command: skill.id });
    } else {
      updateSession(activeSessionId, { command: skill.id });
    }
  }, [activeSessionId, createNewSession, updateSession]);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={maximized ? { opacity: 0 } : { x: '100%' }}
          animate={maximized ? { opacity: 1 } : { x: 0 }}
          exit={maximized ? { opacity: 0 } : { x: '100%' }}
          transition={maximized ? { duration: 0.2 } : { type: 'spring', damping: 25, stiffness: 200 }}
          className={[
            "fixed inset-y-0 right-0 z-50 flex flex-col border-white/10 bg-neutral-bg/60 backdrop-blur-3xl shadow-2xl transition-all duration-300",
            maximized 
              ? "left-0 w-full" 
              : "w-full sm:w-[420px] border-l"
          ].join(' ')}
        >
          {/* Header */}
          <div className="flex flex-col border-b border-white/10">
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
                      (savingPlan || streaming) && !saveSuccess ? 'opacity-50 cursor-not-allowed' : ''
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
            <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2">
              <p className="text-[10px] font-mono text-red-400">{saveError}</p>
            </div>
          )}

          {/* Session Content */}
          <div className="flex-1 overflow-hidden">
            {(!activeSession || activeSession.messages.length === 0) && !selectedSkill ? (
              <div className="p-4 h-full">
                <CommandPalette onSelect={handleSkillSelect} />
              </div>
            ) : selectedSkill ? (
              <BriefingPanel
                skill={selectedSkill}
                context={context}
                onExecute={handleExecuteSkill}
                onCancel={() => setSelectedSkill(null)}
              />
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
          <div className="border-t border-white/10 p-4 pb-8">
            <ChatInput
              value={input}
              onChange={handleInputChange}
              onSend={() => handleSend()}
              disabled={streaming}
              placeholder={activeSessionId ? "Ask anything..." : "Select a skill to begin..."}
            />
            <div className="mt-3 flex items-center justify-center gap-4 text-[9px] font-bold uppercase tracking-widest text-neutral-muted/50">
              <span className="flex items-center gap-1">
                <Sparkles size={10} />
                AI Augmented
              </span>
              <span>•</span>
              <span>v1.0.0-neural</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
