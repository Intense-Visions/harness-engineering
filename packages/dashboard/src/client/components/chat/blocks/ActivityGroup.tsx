import React from 'react';
import { motion } from 'framer-motion';
import type {
  ContentBlock,
  ThinkingBlock,
  ToolUseBlock,
  StatusBlock,
  TextBlock,
} from '../../../types/chat';
import { formatToolArgs } from './format-tool-args';
import { ThinkingBlockView } from './ThinkingBlockView';
import { StatusBlockView } from './StatusBlockView';
import { TextBlockView } from './TextBlockView';
import { ToolUseBlockView } from './ToolUseBlockView';

export function ActivityGroup({
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
