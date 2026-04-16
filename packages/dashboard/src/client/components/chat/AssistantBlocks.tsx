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
    if (toolLower === 'bash' && (parsed.command || parsed.args)) {
      const cmd = parsed.command || parsed.args;
      // Clean up common long paths in bash commands if they exist
      return cmd.replace(/cd\s+("[^"]+"|'[^']+'|[^\s]+)\s*&&\s*/g, '').slice(0, 100);
    }
    if (parsed.path || parsed.file_path || parsed.filePath) {
      const p = parsed.path || parsed.file_path || parsed.filePath;
      return p.split('/').slice(-2).join('/');
    }
    return JSON.stringify(parsed).slice(0, 100);
  } catch (e) {
    return args.slice(0, 100);
  }
}

function ToolUseBlockView({ block, forceResult }: { block: ToolUseBlock; forceResult?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const result = block.result || forceResult;
  const hasResult = result !== undefined;
  const isActuallyPending = !hasResult;

  return (
    <div className="relative overflow-hidden rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm transition-all duration-200">
      {isActuallyPending && (
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
  return matches / lines.length > 0.1 || matches > 0 || text.length > 100;
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
  let toolGroup: ToolUseBlock[] = [];
  let toolGroupStart = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;

    if (block.kind === 'tool_use') {
      const currentIdx = i;
      const nextBlock = blocks[i + 1];
      let forceResult: string | undefined;

      // Aggressively pair text blocks following tool_use as results
      // unless they are very likely to be separate conversational text
      if (block.result === undefined && nextBlock?.kind === 'text') {
        const isLikelyOutput = isLogOutput(nextBlock.text, block.tool);
        if (isLikelyOutput) {
          forceResult = nextBlock.text;
          i++; // Consume the next block
        }
      }

      if (toolGroup.length === 0) toolGroupStart = currentIdx;
      const resolvedResult = block.result ?? forceResult;
      toolGroup.push({
        ...block,
        ...(resolvedResult !== undefined && { result: resolvedResult }),
      });
    } else {
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

  if (toolGroup.length > 0) {
    elements.push(
      <ToolGroup key={`tg-${toolGroupStart}`} tools={toolGroup} startIndex={toolGroupStart} />
    );
  }

  return <div className="flex flex-col gap-2">{elements}</div>;
}
