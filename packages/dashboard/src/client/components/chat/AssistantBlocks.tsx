import React from 'react';
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

function ToolUseBlockView({ block }: { block: ToolUseBlock }) {
  const hasResult = block.result !== undefined;
  return (
    <details
      className="relative overflow-hidden rounded border border-neutral-border/50 bg-neutral-surface/50 backdrop-blur-sm"
      open={block.isError}
    >
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
      if (toolGroup.length === 0) toolGroupStart = i;
      toolGroup.push(block);
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
