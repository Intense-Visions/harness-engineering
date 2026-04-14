import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import type { PendingInteraction, ChatSSEEvent } from '../types/orchestrator';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

async function streamChat(
  messages: ChatMessage[],
  system: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal: AbortSignal
): Promise<void> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
      signal,
    });

    if (!res.ok || !res.body) {
      onError(`Chat request failed: HTTP ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          onDone();
          return;
        }
        try {
          const event = JSON.parse(payload) as ChatSSEEvent;
          if (event.type === 'text') {
            onChunk(event.text);
          } else if (event.type === 'error') {
            onError(event.error);
            return;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    onDone();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      onError((err as Error).message ?? 'Stream failed');
    }
  }
}

export function Chat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const interactionId = searchParams.get('interactionId');

  const [interaction, setInteraction] = useState<PendingInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Abort any in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Fetch interaction on mount
  useEffect(() => {
    if (!interactionId) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/interactions');
        if (res.ok) {
          const all = (await res.json()) as PendingInteraction[];
          const found = all.find((i) => i.id === interactionId);
          if (found) {
            setInteraction(found);
            // Claim the interaction
            if (found.status === 'pending') {
              await fetch(`/api/interactions/${found.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'claimed' }),
              });
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [interactionId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming || !interaction) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setStreaming(true);

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamChat(
      updatedMessages,
      buildSystemPrompt(interaction),
      (text) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + text };
          }
          return updated;
        });
      },
      () => setStreaming(false),
      (error) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + `\n\n[Error: ${error}]`,
            };
          }
          return updated;
        });
        setStreaming(false);
      },
      controller.signal
    );
  }, [input, streaming, messages, interaction]);

  const handleSavePlan = useCallback(async () => {
    if (!interaction) return;

    // Find the last assistant message as the plan content
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant?.content) return;

    setSavingPlan(true);
    setSaveError(null);

    try {
      const date = new Date().toISOString().slice(0, 10);
      const slug = interaction.issueId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const filename = `${date}-${slug}-plan.md`;

      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: lastAssistant.content }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      // Resolve the interaction
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

  if (!interactionId) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Claude Chat</h1>
        <p className="text-sm text-gray-500">
          No interaction selected. Go to Needs Attention to claim one.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Claude Chat</h1>
        <p className="text-sm text-gray-500">Loading interaction context...</p>
      </div>
    );
  }

  if (!interaction) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Claude Chat</h1>
        <p className="text-sm text-red-400">Interaction not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{interaction.context.issueTitle}</h1>
          <p className="text-xs text-gray-500">{interaction.issueId} · Claude Chat Pane</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleSavePlan()}
            disabled={savingPlan || streaming || messages.length === 0}
            className={[
              'rounded px-3 py-1.5 text-xs font-medium',
              saveSuccess
                ? 'bg-emerald-800 text-emerald-200'
                : 'bg-blue-700 text-white hover:bg-blue-600',
              (savingPlan || streaming) && !saveSuccess ? 'cursor-not-allowed opacity-50' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {savingPlan ? 'Saving...' : saveSuccess ? 'Plan Saved' : 'Save Plan'}
          </button>
          <button
            onClick={() => void navigate('/orchestrator/attention')}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      </div>

      {saveError && <p className="mb-2 text-xs text-red-400">{saveError}</p>}

      {/* Context sidebar */}
      <div className="mb-4 rounded border border-gray-800 bg-gray-900 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">Context</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
          {interaction.reasons.map((r, i) => (
            <span key={i} className="rounded bg-yellow-900/30 px-2 py-0.5 text-yellow-400">
              {r}
            </span>
          ))}
          {interaction.context.specPath && (
            <span className="font-mono">{interaction.context.specPath}</span>
          )}
          {interaction.context.relatedFiles.map((f) => (
            <span key={f} className="font-mono">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Start a conversation. The context from the escalated issue is pre-loaded.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={['mb-4', msg.role === 'user' ? 'text-right' : 'text-left'].join(' ')}
          >
            <span className="mb-1 block text-xs text-gray-500">
              {msg.role === 'user' ? 'You' : 'Claude'}
            </span>
            <div
              className={[
                'inline-block max-w-[80%] rounded-lg px-4 py-2 text-sm',
                msg.role === 'user' ? 'bg-blue-900 text-white' : 'bg-gray-800 text-gray-100',
              ].join(' ')}
            >
              <pre className="whitespace-pre-wrap font-sans">
                {msg.content || (streaming && i === messages.length - 1 ? '...' : '')}
              </pre>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type your message..."
          disabled={streaming}
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {streaming ? 'Streaming...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
