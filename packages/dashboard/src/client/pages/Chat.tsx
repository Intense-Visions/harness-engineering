import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Sparkles, ArrowLeft, Save } from 'lucide-react';
import type { PendingInteraction } from '../types/orchestrator';
import { streamChat, applyChunk } from '../utils/chat-stream';
import type { ChatMessage, UserMessage, AssistantMessage, TextBlock } from '../types/chat';
import { MessageStream } from '../components/chat/MessageStream';
import { ChatInput } from '../components/chat/ChatInput';

// --- System prompt ---

function buildSystemPrompt(interaction: PendingInteraction): string {
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

// --- Main component ---

export function Chat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const interactionId = searchParams.get('interactionId');

  const [interaction, setInteraction] = useState<PendingInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!interactionId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/interactions', { signal: controller.signal });
        if (res.ok) {
          const all = (await res.json()) as PendingInteraction[];
          const found = all.find((i) => i.id === interactionId);
          if (found) {
            setInteraction(found);
            if (found.status === 'pending') {
              await fetch(`/api/interactions/${found.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'claimed' }),
              });
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [interactionId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming || !interaction) return;

    const prompt = input.trim();
    const userMessage: UserMessage = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', blocks: [] }]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const isFirstTurn = !sessionId;

    await streamChat(
      prompt,
      isFirstTurn ? buildSystemPrompt(interaction) : undefined,
      sessionId,
      {
        onSession: (id) => setSessionId(id),
        onChunk: (event) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (!last || last.role !== 'assistant') return prev;

            const blocks = [...last.blocks];
            applyChunk(blocks, event);
            updated[updated.length - 1] = { role: 'assistant', blocks };
            return updated;
          });
        },
        onDone: () => setStreaming(false),
        onError: (error) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                role: 'assistant',
                blocks: [...last.blocks, { kind: 'text', text: `**Error:** ${error}` }],
              };
            }
            return updated;
          });
          setStreaming(false);
        },
      },
      controller.signal
    );
  }, [input, streaming, interaction, sessionId]);

  const handleSavePlan = useCallback(async () => {
    if (!interaction) return;

    const lastAssistant = [...messages]
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
        const body = (await res.json()) as { error?: string };
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
  }, [interaction, messages]);

  // --- Render ---

  if (!interactionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-black tracking-tighter">Neural Link Offline</h1>
          <p className="text-sm text-neutral-muted font-mono uppercase tracking-widest">
            Select an interaction to initiate uplink.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent shadow-[0_0_15px_var(--color-primary-500)]" />
      </div>
    );
  }

  if (!interaction) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-400 font-mono tracking-widest uppercase">
          Interaction Error
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => void navigate('/orchestrator/attention')}
            className="rounded-full p-2 text-neutral-muted transition-colors hover:bg-neutral-surface hover:text-neutral-text"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{interaction.context.issueTitle}</h1>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
              <span>{interaction.issueId}</span>
              <span className="text-primary-500/50">/</span>
              <span className="flex items-center gap-1 text-primary-500">
                <Sparkles size={12} />
                AI Augmented
              </span>
              {sessionId && (
                <>
                  <span className="text-primary-500/50">/</span>
                  <span>Session:{sessionId.slice(0, 8)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void handleSavePlan()}
            disabled={savingPlan || streaming || messages.length === 0}
            className={[
              'flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all',
              saveSuccess
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-primary-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]',
              (savingPlan || streaming) && !saveSuccess ? 'cursor-not-allowed opacity-50' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {saveSuccess ? <Sparkles size={14} /> : <Save size={14} />}
            {savingPlan ? 'Saving...' : saveSuccess ? 'Plan Saved' : 'Save Plan'}
          </motion.button>
        </div>
      </div>

      {saveError && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="text-xs font-mono text-red-400"
        >
          {saveError}
        </motion.p>
      )}

      {/* Context Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-border bg-neutral-surface/40 p-2 backdrop-blur-md">
        <span className="px-2 text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
          Telemetry
        </span>
        <div className="flex flex-wrap gap-1.5">
          {interaction.reasons.map((r, i) => (
            <span
              key={i}
              className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500 border border-amber-500/20"
            >
              {r}
            </span>
          ))}
          {interaction.context.specPath && (
            <span className="rounded-md bg-neutral-surface px-2 py-0.5 font-mono text-[10px] text-neutral-muted border border-neutral-border">
              {interaction.context.specPath}
            </span>
          )}
          {interaction.context.relatedFiles.map((f) => (
            <span
              key={f}
              className="rounded-md bg-neutral-surface px-2 py-0.5 font-mono text-[10px] text-neutral-muted border border-neutral-border"
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Message stream */}
      <MessageStream messages={messages} streaming={streaming} />

      {/* Input Section */}
      <div className="mt-2">
        <ChatInput value={input} onChange={setInput} onSend={handleSend} disabled={streaming} />
      </div>
    </div>
  );
}
