import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import type {
  ContentBlock,
  ThinkingBlock,
  ToolUseBlock,
  StatusBlock,
  TextBlock,
} from '../../types/chat';

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

function formatToolArgs(tool: string, args?: string) {
  if (!args) return '';
  const toolLower = tool.toLowerCase();
  try {
    const parsed = JSON.parse(args);
    if (toolLower.includes('todo') && parsed.todos && Array.isArray(parsed.todos)) {
      return `Updating ${parsed.todos.length} tasks`;
    }
    if (toolLower === 'bash' && (parsed.command || parsed.args)) {
      const cmd = parsed.command || parsed.args;
      // Clean up common long paths in bash commands if they exist
      return cmd.replace(/cd\s+("[^"]+"|'[^']+'|[^\s]+)\s*&&\s*/g, '').slice(0, 100);
    }
    if (toolLower === 'agent' || toolLower === 'subagent' || parsed.subagent_type) {
      const type = parsed.subagent_type || parsed.type;
      if (type && parsed.description) {
        return `${type}: ${parsed.description}`.slice(0, 100);
      }
      if (parsed.description) {
        return parsed.description.slice(0, 100);
      }
    }
    if (parsed.path || parsed.file_path || parsed.filePath) {
      const p = parsed.path || parsed.file_path || parsed.filePath;
      return p.split('/').slice(-2).join('/');
    }
    return JSON.stringify(parsed).slice(0, 100);
  } catch {
    return args.slice(0, 100);
  }
}

function ToolUseBlockView({
  block,
  forceResult,
  isPending = false,
}: {
  block: ToolUseBlock;
  forceResult?: string;
  isPending?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const result = block.result || forceResult;
  const hasResult = result !== undefined;

  const isTodoWrite = block.tool.toLowerCase().includes('todo');
  let todos: { content: string; status: string; activeForm?: string }[] | null = null;
  if (isTodoWrite && block.args) {
    try {
      const parsed = JSON.parse(block.args);
      if (parsed.todos && Array.isArray(parsed.todos)) {
        todos = parsed.todos;
      }
    } catch {
      // ignore
    }
  }

  const _hasExpandedContent = hasResult || todos !== null;

  return (
    <div className="relative overflow-hidden rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm transition-all duration-200">
      {isPending && !hasResult && (
        <motion.div
          initial={{ top: '-10%' }}
          animate={{ top: '110%' }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute left-0 right-0 h-4 bg-gradient-to-b from-transparent via-secondary-400/20 to-transparent pointer-events-none z-10"
        />
      )}

      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none relative z-20 hover:bg-white/5 active:bg-white/10 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          className="text-[9px] text-secondary-400 font-bold"
        >
          &#9654;
        </motion.span>
        <span className="text-[10px] font-black tracking-[0.2em] text-neutral-text capitalize">
          {block.tool.replace(/_/g, ' ')}
        </span>
        {block.args && (
          <span className="truncate font-mono text-[9px] text-neutral-muted/60" title={block.args}>
            {formatToolArgs(block.tool, block.args)}
          </span>
        )}
        {hasResult && (
          <div className="ml-auto flex items-center gap-2">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                block.isError
                  ? 'text-red-400 border-red-400/30 bg-red-400/5'
                  : 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'
              }`}
            >
              {block.isError ? 'ERR' : 'OK'}
            </span>
          </div>
        )}
      </div>

      {isOpen && hasResult && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-neutral-border/50 bg-neutral-bg/50 relative z-20 px-3 py-2"
        >
          <div
            className={`max-h-[60vh] overflow-auto prose prose-invert prose-xs selection:bg-secondary-400/20 ${
              block.isError ? 'text-red-400' : ''
            }`}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{result}</Markdown>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function AgentBlockView({ block }: { block: ToolUseBlock }) {
  let parsedArgs: Record<string, string | undefined> = {};
  if (block.args) {
    try {
      parsedArgs = JSON.parse(block.args);
    } catch {
      // ignore
    }
  }

  const isSkill = block.tool.toLowerCase() === 'skill';
  const containerClasses = isSkill
    ? 'border-emerald-400/20 bg-emerald-400/5'
    : 'border-secondary-400/20 bg-secondary-400/5';

  const headerClasses = isSkill
    ? 'border-emerald-400/10 bg-emerald-400/10'
    : 'border-secondary-400/10 bg-secondary-400/10';

  const iconClasses = isSkill ? 'text-emerald-400' : 'text-secondary-400';
  const textTitleClasses = isSkill ? 'text-emerald-300' : 'text-secondary-300';
  const textRunningClasses = isSkill ? 'text-emerald-400' : 'text-secondary-400';
  const borderDescClasses = isSkill ? 'border-emerald-400/10' : 'border-secondary-400/10';

  const titleText = isSkill
    ? `Skill: ${parsedArgs.skill || 'Execution'}`
    : `Subagent: ${parsedArgs.subagent_type || parsedArgs.type || 'Execution'}`;

  const mainDesc = isSkill ? undefined : parsedArgs.description;
  const promptText = isSkill ? parsedArgs.args : parsedArgs.prompt;

  return (
    <div className={`my-3 rounded border ${containerClasses} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${headerClasses}`}>
        <svg
          className={`w-3 h-3 ${iconClasses}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isSkill ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          )}
        </svg>
        <span className={`font-bold tracking-widest uppercase text-[10px] ${textTitleClasses}`}>
          {titleText}
        </span>
        {!block.result && !block.isError && (
          <span className={`ml-auto text-[10px] ${textRunningClasses} animate-pulse`}>
            Running...
          </span>
        )}
        {block.isError && <span className="ml-auto text-[10px] text-red-400">Error</span>}
      </div>

      <div className="flex flex-col p-3 gap-2">
        {mainDesc && <div className="text-[13px] font-bold text-neutral-text">{mainDesc}</div>}
        {promptText && (
          <div className="text-xs text-neutral-muted bg-neutral-surface/40 p-2 rounded border border-neutral-border/50 whitespace-pre-wrap font-mono leading-relaxed mt-1 overflow-x-auto">
            {promptText}
          </div>
        )}
        {block.result && (
          <div
            className={`mt-2 pt-2 border-t ${borderDescClasses} text-xs text-neutral-muted prose prose-invert prose-xs max-h-[40vh] overflow-auto`}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{block.result}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoBlockView({ block }: { block: ToolUseBlock }) {
  let todos: { content: string; status: string; activeForm?: string }[] | null = null;
  if (block.args) {
    try {
      const parsed = JSON.parse(block.args);
      if (parsed.todos && Array.isArray(parsed.todos)) {
        todos = parsed.todos;
      }
    } catch {
      // ignore
    }
  }

  if (!todos) {
    return <ToolUseBlockView block={block} isPending={false} />;
  }

  return (
    <div className="my-3 rounded border border-primary-500/20 bg-primary-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary-500/10 bg-primary-500/10">
        <svg
          className="w-3 h-3 text-primary-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <span className="font-bold tracking-widest uppercase text-[10px] text-primary-300">
          Todo Plan
        </span>
        {block.isError && <span className="ml-auto text-[10px] text-red-400">Error Parsing</span>}
      </div>

      <div className="flex flex-col p-3 gap-2">
        {todos.map((todo, idx) => {
          const isCompleted = todo.status === 'completed' || todo.status === 'done';
          const isInProgress = todo.status === 'in_progress';
          return (
            <div key={idx} className="flex items-start gap-3 text-sm">
              <div className="pt-1 shrink-0">
                {isCompleted ? (
                  <div className="h-3.5 w-3.5 rounded bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                ) : isInProgress ? (
                  <div className="h-3.5 w-3.5 rounded bg-secondary-400/20 border border-secondary-400 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-secondary-400 animate-pulse" />
                  </div>
                ) : (
                  <div className="h-3.5 w-3.5 rounded border border-neutral-border bg-neutral-surface/50" />
                )}
              </div>
              <div className="flex flex-col leading-snug pt-[1px]">
                <span
                  className={`text-neutral-text text-[13px] ${isCompleted ? 'line-through text-neutral-muted' : ''}`}
                >
                  {todo.content}
                </span>
                {todo.activeForm && isInProgress && (
                  <span className="text-xs text-secondary-400 mt-1 font-mono">
                    ▶ {todo.activeForm}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {block.result && (
          <div className="mt-2 pt-2 border-t border-primary-500/10 text-xs text-neutral-muted">
            <Markdown remarkPlugins={[remarkGfm]}>{block.result}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

function isLogOutput(text: string, tool?: string) {
  const toolLower = tool?.toLowerCase();
  const isCodeTool = toolLower === 'read' || toolLower === 'read_file' || toolLower === 'bash';

  // For code/bash tools, we are very aggressive about pairing/collapsing
  if (isCodeTool) return true;

  const logMarkers = [
    /^>\s/,
    /^\$\s/,
    /^RUN\s/,
    /^[@\w-]+\/@?[\w-]+/,
    /\[\d{1,2}m/,
    /\[\]\s\[\d{2}/,
    /^(\s*\||\s*\+|-{3,})/,
    /^(\s*[✔✘ℹ⚠]\s)/,
    /^\s*\d+\s+import\s+/i,
    /^\s*\d+\s+export\s+/i,
    /^\s*\d+\s+\w+/,
    /import\s+.*\s+from\s+['"]/,
    /const\s+.*\s+=\s+require\(/,
  ];

  const lines = text.trim().split('\n');
  if (lines.length === 0) return false;

  const matches = lines.filter((l) => logMarkers.some((m) => m.test(l.trim()))).length;
  return matches / lines.length > 0.1 || matches > 0;
}

function LogOutputView({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="my-1 rounded border border-neutral-border/30 bg-neutral-surface/30 backdrop-blur-sm overflow-hidden transition-all duration-200">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-neutral-surface/50 active:bg-neutral-surface transition-colors select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <motion.span
          animate={{ rotate: isOpen ? 90 : 0 }}
          className="text-[9px] text-neutral-muted"
        >
          &#9654;
        </motion.span>
        <span className="text-[10px] font-black tracking-[0.2em] text-neutral-muted/60">
          Terminal Output
        </span>
        {!isOpen && (
          <span className="truncate text-[9px] text-neutral-muted/50 italic ml-2">
            {text.trim().slice(0, 60)}...
          </span>
        )}
      </div>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-neutral-border/20 bg-neutral-bg/30 px-3 py-2"
        >
          <div className="max-h-[50vh] overflow-auto prose prose-invert prose-xs selection:bg-secondary-400/20">
            <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StatusBlockView({ block }: { block: StatusBlock }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
      <span className="font-mono text-[10px] tracking-widest text-neutral-muted">{block.text}</span>
    </div>
  );
}

function TextBlockView({ block }: { block: TextBlock }) {
  if (isLogOutput(block.text)) {
    return <LogOutputView text={block.text} />;
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none py-1 selection:bg-primary-500/30">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const {
              node: _node,
              className,
              children,
              ...rest
            } = props as React.HTMLAttributes<HTMLElement> & { node?: unknown };
            const inline = !(className && /language-(\w+)/.test(className));
            const match = /language-(\w+)/.exec(className ?? '');
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
                    {...rest}
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    className="!bg-neutral-surface/40 !m-0 !p-4 !text-[11px] font-mono leading-relaxed"
                  >
                    {(Array.isArray(children)
                      ? children.join('')
                      : typeof children === 'string'
                        ? children
                        : ''
                    ).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              </div>
            ) : (
              <code
                className={`${className} bg-neutral-surface/60 px-1.5 py-0.5 rounded text-secondary-400 font-mono text-[11px] border border-neutral-border`}
                {...rest}
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

function ActivityGroup({
  blocks,
  startIndex,
  isStreaming,
  isLastGroup,
}: {
  blocks: ContentBlock[];
  startIndex: number;
  isStreaming: boolean;
  isLastGroup: boolean;
}) {
  const _toolCount = blocks.filter((b) => b.kind === 'tool_use').length;

  if (blocks.length === 0) return null;

  // Don't wrap if it's just a single thinking or status block
  if (blocks.length === 1) {
    const block = blocks[0]!;
    if (block.kind !== 'tool_use' && block.kind !== 'text') {
      if (block.kind === 'thinking') {
        return (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <ThinkingBlockView block={block as ThinkingBlock} />
          </motion.div>
        );
      }
      if (block.kind === 'status') {
        return (
          <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}>
            <StatusBlockView block={block as StatusBlock} />
          </motion.div>
        );
      }
    }
  }

  return (
    <div className="relative flex flex-col gap-[2px] my-1">
      {(() => {
        const elements: React.ReactNode[] = [];
        let toolCluster: { block: ContentBlock; localIndex: number }[] = [];

        const flushCluster = () => {
          if (toolCluster.length === 0) return;
          if (toolCluster.length >= 3) {
            const lastTool = toolCluster[toolCluster.length - 1]!.block as ToolUseBlock;

            elements.push(
              <details
                key={`cluster-${elements.length}`}
                className="rounded border border-neutral-border/50 bg-neutral-bg/30 my-1"
              >
                <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-muted select-none flex items-center gap-2">
                  <div className="flex -space-x-1 shrink-0">
                    <div className="h-2 w-2 rounded-full bg-secondary-400/50" />
                    <div className="h-2 w-2 rounded-full bg-secondary-400/70" />
                    <div className="h-2 w-2 rounded-full bg-secondary-400" />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                    <span className="shrink-0">Used {toolCluster.length} tools</span>
                    <span className="shrink-0 opacity-30 text-lg leading-none mt-[-2px]">·</span>
                    <span className="truncate opacity-75 capitalize tracking-widest text-[9px] font-black text-neutral-text">
                      {lastTool.tool.replace(/_/g, ' ')}
                      {lastTool.args && (
                        <span className="font-mono text-[9px] font-normal normal-case tracking-normal ml-2 text-neutral-muted/80">
                          {formatToolArgs(lastTool.tool, lastTool.args)}
                        </span>
                      )}
                    </span>
                  </div>
                </summary>
                <div className="flex flex-col gap-[2px] border-t border-neutral-border/50 p-2">
                  {toolCluster.map(({ block, localIndex }) => {
                    const isLast = isLastGroup && localIndex === blocks.length - 1;
                    return (
                      <ToolUseBlockView
                        key={startIndex + localIndex}
                        block={block as ToolUseBlock}
                        isPending={isLast && isStreaming}
                      />
                    );
                  })}
                </div>
              </details>
            );
          } else {
            toolCluster.forEach(({ block, localIndex }) => {
              const isLast = isLastGroup && localIndex === blocks.length - 1;
              elements.push(
                <ToolUseBlockView
                  key={startIndex + localIndex}
                  block={block as ToolUseBlock}
                  isPending={isLast && isStreaming}
                />
              );
            });
          }
          toolCluster = [];
        };

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i]!;
          if (block.kind === 'tool_use') {
            toolCluster.push({ block, localIndex: i });
          } else {
            flushCluster();

            switch (block.kind) {
              case 'thinking':
                elements.push(
                  <motion.div
                    key={startIndex + i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <ThinkingBlockView block={block as ThinkingBlock} />
                  </motion.div>
                );
                break;
              case 'status':
                elements.push(
                  <motion.div
                    key={startIndex + i}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <StatusBlockView block={block as StatusBlock} />
                  </motion.div>
                );
                break;
              case 'text':
                elements.push(
                  <motion.div
                    key={startIndex + i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <TextBlockView block={block as TextBlock} />
                  </motion.div>
                );
                break;
            }
          }
        }
        flushCluster();
        return elements;
      })()}
    </div>
  );
}

export function AssistantBlocks({
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

  const elements: React.ReactNode[] = [];
  let activityGroup: ContentBlock[] = [];
  let activityGroupStart = 0;
  const consumedIndices = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    if (consumedIndices.has(i)) continue;
    let block = blocks[i]!;
    let isActivity = false;

    if (block.kind === 'tool_use') {
      isActivity = true;
      let forceResultChunks: string[] = [];

      // Look ahead to aggressively pair ALL text/status log chunks following tool_use as results,
      let lookAhead = i + 1;
      while (lookAhead < blocks.length) {
        if (consumedIndices.has(lookAhead)) {
          lookAhead++;
          continue;
        }
        const nextB = blocks[lookAhead]!;
        if (nextB.kind === 'tool_use' || nextB.kind === 'thinking') break; // Next tool_use or thinking interrupts pairing

        if (nextB.kind === 'text') {
          if (isLogOutput(nextB.text, block.tool)) {
            forceResultChunks.push(nextB.text);
            consumedIndices.add(lookAhead);
          } else {
            break; // Stop at first conversational text block
          }
        } else if (nextB.kind === 'status') {
          forceResultChunks.push(nextB.text);
          consumedIndices.add(lookAhead);
        }
        lookAhead++;
      }

      const chunkString = forceResultChunks.length > 0 ? forceResultChunks.join('\n\n') : undefined;
      const resolvedResult = chunkString
        ? block.result
          ? `${chunkString}\n\n${block.result}`
          : chunkString
        : block.result;
      block = {
        ...block,
        ...(resolvedResult !== undefined && { result: resolvedResult }),
      };

      const isTodoWrite = block.tool.toLowerCase().includes('todo');
      const isAgent =
        block.tool.toLowerCase() === 'agent' || block.tool.toLowerCase() === 'subagent';
      const isSkill = block.tool.toLowerCase() === 'skill';
      if (isTodoWrite || isAgent || isSkill) {
        isActivity = false;
      }
    } else if (block.kind === 'thinking' || block.kind === 'status') {
      isActivity = true;
    } else if (block.kind === 'text' && isLogOutput(block.text)) {
      isActivity = true;
    }

    if (isActivity) {
      if (activityGroup.length === 0) activityGroupStart = i;
      activityGroup.push(block);
    } else {
      if (activityGroup.length > 0) {
        elements.push(
          <ActivityGroup
            key={`ag-${activityGroupStart}`}
            blocks={activityGroup}
            startIndex={activityGroupStart}
            isStreaming={isStreaming}
            isLastGroup={false}
          />
        );
        activityGroup = [];
      }

      if (block.kind === 'tool_use' && block.tool.toLowerCase().includes('todo')) {
        elements.push(
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <TodoBlockView block={block as ToolUseBlock} />
          </motion.div>
        );
      } else if (
        block.kind === 'tool_use' &&
        (block.tool.toLowerCase() === 'agent' ||
          block.tool.toLowerCase() === 'subagent' ||
          block.tool.toLowerCase() === 'skill')
      ) {
        elements.push(
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <AgentBlockView block={block as ToolUseBlock} />
          </motion.div>
        );
      } else {
        elements.push(
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <TextBlockView block={block as TextBlock} />
          </motion.div>
        );
      }
    }
  }

  if (activityGroup.length > 0) {
    elements.push(
      <ActivityGroup
        key={`ag-${activityGroupStart}`}
        blocks={activityGroup}
        startIndex={activityGroupStart}
        isStreaming={isStreaming}
        isLastGroup={true}
      />
    );
  }

  return <div className="flex flex-col gap-2">{elements}</div>;
}
