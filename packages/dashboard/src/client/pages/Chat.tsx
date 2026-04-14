import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import Markdown from 'react-markdown';
import type { PendingInteraction, ChatSSEEvent } from '../types/orchestrator';

// --- Block-based message model ---

interface ThinkingBlock {
  kind: 'thinking';
  text: string;
}

interface ToolBlock {
  kind: 'tool';
  text: string;
}

interface StatusBlock {
  kind: 'status';
  text: string;
}

interface TextBlock {
  kind: 'text';
  text: string;
}

type ContentBlock = ThinkingBlock | ToolBlock | StatusBlock | TextBlock;

interface UserMessage {
  role: 'user';
  content: string;
}

interface AssistantMessage {
  role: 'assistant';
  blocks: ContentBlock[];
}

type ChatMessage = UserMessage | AssistantMessage;

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

// --- Streaming ---

interface StreamCallbacks {
  onChunk: (chunk: { type: string; text: string }) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

async function streamChat(
  messages: ChatMessage[],
  system: string,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  // Convert block-based messages to flat format for the API
  const apiMessages = messages.map((m) =>
    m.role === 'user'
      ? { role: 'user' as const, content: m.content }
      : {
          role: 'assistant' as const,
          content: m.blocks
            .filter((b): b is TextBlock => b.kind === 'text')
            .map((b) => b.text)
            .join(''),
        }
  );

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages, system }),
      signal,
    });

    if (!res.ok || !res.body) {
      callbacks.onError(`Chat request failed: HTTP ${res.status}`);
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
          callbacks.onDone();
          return;
        }
        try {
          const event = JSON.parse(payload) as ChatSSEEvent;
          if (event.type === 'error') {
            callbacks.onError(event.error);
            return;
          }
          if ('text' in event && event.text) {
            callbacks.onChunk({ type: event.type, text: event.text });
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    callbacks.onDone();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError((err as Error).message ?? 'Stream failed');
    }
  }
}

// --- Block rendering ---

function ThinkingBlockView({ block }: { block: ThinkingBlock }) {
  return (
    <details className="rounded border border-gray-700 bg-gray-900/50">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-400 select-none">
        Thinking...
      </summary>
      <div className="border-t border-gray-700 px-3 py-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">{block.text}</p>
      </div>
    </details>
  );
}

function ToolBlockView({ block }: { block: ToolBlock }) {
  return (
    <div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900/50 px-3 py-2">
      <span className="text-xs text-blue-400">&#9655;</span>
      <span className="font-mono text-xs text-gray-400">{block.text}</span>
    </div>
  );
}

function StatusBlockView({ block }: { block: StatusBlock }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
      <span className="font-mono text-xs italic text-gray-500">{block.text}</span>
    </div>
  );
}

function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <Markdown>{block.text}</Markdown>
    </div>
  );
}

function AssistantBlocks({
  blocks,
  isStreaming,
}: {
  blocks: ContentBlock[];
  isStreaming: boolean;
}) {
  if (blocks.length === 0 && isStreaming) {
    return <span className="inline-block h-4 w-2 animate-pulse bg-gray-500" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'thinking':
            return <ThinkingBlockView key={i} block={block} />;
          case 'tool':
            return <ToolBlockView key={i} block={block} />;
          case 'status':
            return <StatusBlockView key={i} block={block} />;
          case 'text':
            return <TextBlockView key={i} block={block} />;
        }
      })}
    </div>
  );
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

    const userMessage: UserMessage = { role: 'user', content: input.trim() };
    const updatedMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setStreaming(true);

    // Add empty assistant message
    const assistantMsg: AssistantMessage = { role: 'assistant', blocks: [] };
    setMessages((prev) => [...prev, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamChat(
      updatedMessages,
      buildSystemPrompt(interaction),
      {
        onChunk: ({ type, text }) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (!last || last.role !== 'assistant') return prev;

            const blocks = [...last.blocks];
            const lastBlock = blocks[blocks.length - 1];
            const kind = mapChunkKind(type);

            // Status blocks always replace (show latest activity)
            if (kind === 'status') {
              if (lastBlock?.kind === 'status') {
                blocks[blocks.length - 1] = { kind: 'status', text };
              } else {
                blocks.push({ kind: 'status', text });
              }
            }
            // Same-kind blocks get appended to (streaming accumulation)
            else if (lastBlock && lastBlock.kind === kind) {
              blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
            }
            // Different kind = new block
            else {
              // Remove trailing status block when real content arrives
              if (lastBlock?.kind === 'status') {
                blocks.pop();
              }
              blocks.push({ kind, text });
            }

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
                blocks: [...last.blocks, { kind: 'text', text: `\n\n**Error:** ${error}` }],
              };
            }
            return updated;
          });
          setStreaming(false);
        },
      },
      controller.signal
    );
  }, [input, streaming, messages, interaction]);

  const handleSavePlan = useCallback(async () => {
    if (!interaction) return;

    // Find the last assistant message's text blocks as plan content
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

      {/* Context */}
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

      {/* Message stream */}
      <div className="flex-1 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Start a conversation. The context from the escalated issue is pre-loaded.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="mb-4">
            {msg.role === 'user' ? (
              <div className="text-right">
                <span className="mb-1 block text-xs text-gray-500">You</span>
                <div className="inline-block max-w-[80%] rounded-lg bg-blue-900 px-4 py-2 text-sm text-white">
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
              </div>
            ) : (
              <div>
                <span className="mb-1 block text-xs text-gray-500">Claude</span>
                <div className="max-w-[90%]">
                  <AssistantBlocks
                    blocks={msg.blocks}
                    isStreaming={streaming && i === messages.length - 1}
                  />
                </div>
              </div>
            )}
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

/** Map SSE event type to block kind. */
function mapChunkKind(type: string): ContentBlock['kind'] {
  switch (type) {
    case 'thinking':
      return 'thinking';
    case 'tool':
      return 'tool';
    case 'status':
      return 'status';
    default:
      return 'text';
  }
}
