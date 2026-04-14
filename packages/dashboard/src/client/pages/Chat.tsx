import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import Markdown from 'react-markdown';
import type { PendingInteraction, ChatSSEEvent } from '../types/orchestrator';

// --- Block-based message model ---

interface ThinkingBlock {
  kind: 'thinking';
  text: string;
}

interface ToolUseBlock {
  kind: 'tool_use';
  tool: string;
  args?: string;
  result?: string;
  isError?: boolean;
}

interface StatusBlock {
  kind: 'status';
  text: string;
}

interface TextBlock {
  kind: 'text';
  text: string;
}

type ContentBlock = ThinkingBlock | ToolUseBlock | StatusBlock | TextBlock;

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

// --- Streaming with session support ---

interface StreamCallbacks {
  onSession: (sessionId: string) => void;
  onChunk: (event: ChatSSEEvent) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

async function streamChat(
  prompt: string,
  system: string | undefined,
  sessionId: string | undefined,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, sessionId }),
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
          if (event.type === 'session') {
            callbacks.onSession(event.sessionId);
          } else if (event.type === 'error') {
            callbacks.onError(event.error);
            return;
          } else {
            callbacks.onChunk(event);
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

// --- Block rendering components ---

function ThinkingBlockView({ block }: { block: ThinkingBlock }) {
  return (
    <details className="rounded border border-gray-700/50 bg-gray-900/30">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-gray-500 select-none">
        Thinking...
      </summary>
      <div className="border-t border-gray-700/50 px-3 py-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">{block.text}</p>
      </div>
    </details>
  );
}

function ToolUseBlockView({ block }: { block: ToolUseBlock }) {
  const hasResult = block.result !== undefined;
  return (
    <details className="rounded border border-gray-700/50 bg-gray-900/30" open={block.isError}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 select-none">
        <span className="text-xs text-blue-400">&#9655;</span>
        <span className="font-mono text-xs font-medium text-gray-300">{block.tool}</span>
        {block.args && (
          <span className="truncate font-mono text-xs text-gray-600" title={block.args}>
            {block.args.slice(0, 80)}
            {block.args.length > 80 ? '...' : ''}
          </span>
        )}
        {hasResult && (
          <span
            className={`ml-auto text-xs ${block.isError ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {block.isError ? 'error' : 'done'}
          </span>
        )}
      </summary>
      {hasResult && (
        <div className="border-t border-gray-700/50 px-3 py-2">
          <pre
            className={`max-h-40 overflow-auto whitespace-pre-wrap text-xs ${block.isError ? 'text-red-400' : 'text-gray-500'}`}
          >
            {block.result}
          </pre>
        </div>
      )}
    </details>
  );
}

function StatusBlockView({ block }: { block: StatusBlock }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
      <span className="font-mono text-xs italic text-gray-500">{block.text}</span>
    </div>
  );
}

function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none py-1">
      <Markdown>{block.text}</Markdown>
    </div>
  );
}

/** Group and render sequential tool blocks as a collapsible section. */
function ToolGroup({ tools, startIndex }: { tools: ToolUseBlock[]; startIndex: number }) {
  if (tools.length <= 2) {
    return (
      <>
        {tools.map((t, i) => (
          <ToolUseBlockView key={startIndex + i} block={t} />
        ))}
      </>
    );
  }
  return (
    <details className="rounded border border-gray-700/30">
      <summary className="cursor-pointer px-3 py-1.5 text-xs text-gray-400 select-none">
        Used {tools.length} tools
        <span className="ml-2 text-gray-600">{tools.map((t) => t.tool).join(', ')}</span>
      </summary>
      <div className="flex flex-col gap-1 border-t border-gray-700/30 p-2">
        {tools.map((t, i) => (
          <ToolUseBlockView key={startIndex + i} block={t} />
        ))}
      </div>
    </details>
  );
}

/** Render assistant blocks with tool grouping. */
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

  // Group consecutive tool_use blocks (with their results interleaved)
  const elements: React.ReactNode[] = [];
  let toolGroup: ToolUseBlock[] = [];
  let toolGroupStart = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;

    if (block.kind === 'tool_use') {
      if (toolGroup.length === 0) toolGroupStart = i;
      toolGroup.push(block);
    } else {
      // Flush any accumulated tool group
      if (toolGroup.length > 0) {
        elements.push(
          <ToolGroup key={`tg-${toolGroupStart}`} tools={toolGroup} startIndex={toolGroupStart} />
        );
        toolGroup = [];
      }

      switch (block.kind) {
        case 'thinking':
          elements.push(<ThinkingBlockView key={i} block={block} />);
          break;
        case 'status':
          elements.push(<StatusBlockView key={i} block={block} />);
          break;
        case 'text':
          elements.push(<TextBlockView key={i} block={block} />);
          break;
      }
    }
  }

  // Flush trailing tool group
  if (toolGroup.length > 0) {
    elements.push(
      <ToolGroup key={`tg-${toolGroupStart}`} tools={toolGroup} startIndex={toolGroupStart} />
    );
  }

  return <div className="flex flex-col gap-1.5">{elements}</div>;
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
          <p className="text-xs text-gray-500">
            {interaction.issueId} · Claude Chat Pane
            {sessionId && (
              <span className="ml-2 text-gray-600">session: {sessionId.slice(0, 8)}</span>
            )}
          </p>
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
      <div className="mb-4 rounded border border-neutral-border bg-neutral-surface p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-neutral-muted">
          Context
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-neutral-muted">
          {interaction.reasons.map((r, i) => (
            <span key={i} className="rounded bg-accent-500/10 px-2 py-0.5 text-accent-500">
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
      <div className="flex-1 overflow-y-auto rounded border border-neutral-border bg-neutral-bg p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-muted">
            Start a conversation. The context from the escalated issue is pre-loaded.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="mb-4">
            {msg.role === 'user' ? (
              <div className="text-right">
                <span className="mb-1 block text-xs text-neutral-muted">You</span>
                <div className="inline-block max-w-[80%] rounded-lg bg-primary-500 px-4 py-2 text-sm text-neutral-text">
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
              </div>
            ) : (
              <div>
                <span className="mb-1 block text-xs text-neutral-muted">Claude</span>
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
          className="flex-1 rounded border border-neutral-border bg-neutral-surface px-3 py-2 text-sm text-neutral-text placeholder-neutral-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
        />
        <button
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
          className="rounded bg-primary-500 px-4 py-2 text-sm font-medium text-neutral-text hover:bg-primary-500/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {streaming ? 'Streaming...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// --- Block update logic ---

/** Apply an SSE chunk to the block list. */
function applyChunk(blocks: ContentBlock[], event: ChatSSEEvent): void {
  if (event.type === 'session') return;
  if (event.type === 'error') return;

  const lastBlock = blocks[blocks.length - 1];

  if (event.type === 'text') {
    if (lastBlock?.kind === 'text') {
      blocks[blocks.length - 1] = { kind: 'text', text: lastBlock.text + event.text };
    } else {
      // Remove trailing status when text arrives
      if (lastBlock?.kind === 'status') blocks.pop();
      blocks.push({ kind: 'text', text: event.text });
    }
  } else if (event.type === 'thinking') {
    if (lastBlock?.kind === 'thinking') {
      blocks[blocks.length - 1] = { kind: 'thinking', text: lastBlock.text + event.text };
    } else {
      blocks.push({ kind: 'thinking', text: event.text });
    }
  } else if (event.type === 'tool_use') {
    blocks.push({ kind: 'tool_use', tool: event.tool, args: event.args });
  } else if (event.type === 'tool_result') {
    // Attach result to the most recent tool_use block
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]!;
      if (b.kind === 'tool_use' && b.result === undefined) {
        blocks[i] = { ...b, result: event.content, isError: event.isError };
        break;
      }
    }
  } else if (event.type === 'status') {
    // Status blocks replace each other
    if (lastBlock?.kind === 'status') {
      blocks[blocks.length - 1] = { kind: 'status', text: event.text };
    } else {
      blocks.push({ kind: 'status', text: event.text });
    }
  }
}
