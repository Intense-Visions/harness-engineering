import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Sparkles, Send, ArrowLeft, Save } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
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
    <details className="rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm group">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-neutral-muted select-none flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-secondary-400 group-open:animate-pulse" />
        Thinking...
      </summary>
      <div className="border-t border-neutral-border/50 px-3 py-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-muted">
          {block.text}
        </p>
      </div>
    </details>
  );
}

function ToolUseBlockView({ block }: { block: ToolUseBlock }) {
  const hasResult = block.result !== undefined;
  return (
    <details
      className="relative overflow-hidden rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm"
      open={block.isError}
    >
      {/* Scanning Line Animation for Active Tools */}
      {!hasResult && (
        <motion.div
          initial={{ top: '-10%' }}
          animate={{ top: '110%' }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute left-0 right-0 h-4 bg-gradient-to-b from-transparent via-secondary-400/20 to-transparent pointer-events-none z-10"
        />
      )}

      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none relative z-20">
        <span className="text-xs text-secondary-400">&#9655;</span>
        <span className="font-mono text-[11px] font-bold text-neutral-text">{block.tool}</span>
        {block.args && (
          <span className="truncate font-mono text-[10px] text-neutral-muted" title={block.args}>
            {block.args.slice(0, 80)}
            {block.args.length > 80 ? '...' : ''}
          </span>
        )}
        {hasResult && (
          <span
            className={`ml-auto text-[10px] font-bold uppercase tracking-wider ${block.isError ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {block.isError ? 'ERR' : 'OK'}
          </span>
        )}
      </summary>
      {hasResult && (
        <div className="border-t border-neutral-border/50 bg-neutral-bg/50 px-3 py-2 relative z-20">
          <pre
            className={`max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-tight ${block.isError ? 'text-red-400' : 'text-neutral-muted'}`}
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
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-muted">
        {block.text}
      </span>
    </div>
  );
}

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none py-1 selection:bg-primary-500/30">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="relative group my-4">
                <div className="absolute -inset-2 bg-gradient-to-r from-primary-500/10 to-secondary-400/10 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative rounded-lg border border-neutral-border overflow-hidden shadow-2xl">
                  <div className="flex items-center justify-between px-4 py-2 bg-neutral-surface/80 border-b border-neutral-border">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-muted">
                      {match[1]}
                    </span>
                    <div className="flex gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-neutral-border" />
                      <div className="h-1.5 w-1.5 rounded-full bg-neutral-border" />
                    </div>
                  </div>
                  <SyntaxHighlighter
                    {...props}
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    className="!bg-neutral-surface/40 !m-0 !p-4 !text-[11px] font-mono leading-relaxed"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              </div>
            ) : (
              <code
                className={`${className} bg-neutral-surface/60 px-1.5 py-0.5 rounded text-secondary-400 font-mono text-[11px] border border-neutral-border`}
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {block.text}
      </Markdown>
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
    <details className="rounded border border-neutral-border/50">
      <summary className="cursor-pointer px-3 py-1.5 text-xs text-neutral-muted select-none flex items-center gap-2">
        <div className="flex -space-x-1">
          <div className="h-2 w-2 rounded-full bg-secondary-400/50" />
          <div className="h-2 w-2 rounded-full bg-secondary-400/70" />
          <div className="h-2 w-2 rounded-full bg-secondary-400" />
        </div>
        Used {tools.length} tools
      </summary>
      <div className="flex flex-col gap-1 border-t border-neutral-border/50 p-2">
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
    return (
      <motion.div
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="flex gap-1 py-2"
      >
        <div className="h-1.5 w-1.5 rounded-full bg-secondary-400 shadow-[0_0_8px_var(--color-secondary-400)]" />
        <div className="h-1.5 w-1.5 rounded-full bg-secondary-400 shadow-[0_0_8px_var(--color-secondary-400)] delay-100" />
        <div className="h-1.5 w-1.5 rounded-full bg-secondary-400 shadow-[0_0_8px_var(--color-secondary-400)] delay-200" />
      </motion.div>
    );
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
          elements.push(
            <motion.div key={i} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
              <ThinkingBlockView block={block} />
            </motion.div>
          );
          break;
        case 'status':
          elements.push(
            <motion.div key={i} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}>
              <StatusBlockView block={block} />
            </motion.div>
          );
          break;
        case 'text':
          elements.push(
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <TextBlockView block={block} />
            </motion.div>
          );
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

  return <div className="flex flex-col gap-2">{elements}</div>;
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
  const virtuosoRef = useRef<VirtuosoHandle>(null);

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
      <div className="flex-1 overflow-hidden rounded-2xl border border-neutral-border bg-neutral-bg/40 backdrop-blur-sm shadow-inner relative">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
          >
            <div className="mb-4 rounded-full bg-primary-500/10 p-4 text-primary-500">
              <Cpu size={32} className="drop-shadow-[0_0_10px_var(--color-primary-500)]" />
            </div>
            <h2 className="mb-1 text-lg font-bold">Neural Engine Ready</h2>
            <p className="max-w-xs text-xs text-neutral-muted">
              Initiate prompt sequence. The context from the escalated issue is pre-loaded into
              working memory.
            </p>
          </motion.div>
        )}
        <Virtuoso
          ref={virtuosoRef}
          data={messages}
          followOutput="smooth"
          initialTopMostItemIndex={messages.length - 1}
          itemContent={(i, msg) => (
            <div className="px-6 py-3">
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className="mb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-neutral-muted">
                    {msg.role === 'user' ? (
                      <>
                        <span>Operator</span>
                        <div className="h-1.5 w-1.5 rounded-full bg-neutral-muted" />
                      </>
                    ) : (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-primary-500 shadow-[0_0_5px_var(--color-primary-500)]" />
                        <span>Harness Agent</span>
                      </>
                    )}
                  </div>
                  <div
                    className={[
                      'rounded-2xl px-5 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-primary-500 text-white shadow-lg'
                        : 'bg-neutral-surface/60 border border-neutral-border backdrop-blur-xl text-neutral-text',
                    ].join(' ')}
                  >
                    {msg.role === 'user' ? (
                      <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                    ) : (
                      <AssistantBlocks
                        blocks={msg.blocks}
                        isStreaming={streaming && i === messages.length - 1}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        />
      </div>

      {/* Input Section */}
      <div className="relative mt-2">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Execute command or query neural link..."
          disabled={streaming}
          className="w-full resize-none rounded-2xl border border-neutral-border bg-neutral-surface/60 px-5 py-4 pr-14 text-sm text-neutral-text placeholder-neutral-muted/50 backdrop-blur-xl transition-all focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 disabled:opacity-50 shadow-lg"
        />
        <button
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-primary-500 p-2.5 text-white transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 shadow-[0_0_15px_rgba(79,70,229,0.3)]"
        >
          {streaming ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send size={18} />
          )}
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
