import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ContentBlock } from '../../types/chat';
import { computeBlockSegments, segmentKey, type BlockSegment } from './block-segments';
import { StreamingIndicator } from './blocks/StreamingIndicator';
import { ActivityGroup } from './blocks/ActivityGroup';
import { AgentBlockView } from './blocks/AgentBlockView';
import { TodoBlockView } from './blocks/TodoBlockView';
import { ToolUseBlockView } from './blocks/ToolUseBlockView';
import { TextBlockView } from './blocks/TextBlockView';

export function BlockSegmentView({
  segment,
  isStreaming,
}: {
  segment: BlockSegment;
  isStreaming: boolean;
}) {
  switch (segment.kind) {
    case 'agent':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <AgentBlockView block={segment.block}>
            {segment.childBlocks.length > 0 && (
              <ActivityGroup
                blocks={segment.childBlocks}
                startIndex={segment.childStartIndex}
                isStreaming={isStreaming}
                isLastGroup={segment.childIsLastGroup}
              />
            )}
          </AgentBlockView>
        </motion.div>
      );
    case 'todo':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <TodoBlockView block={segment.block} />
        </motion.div>
      );
    case 'interaction':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <ToolUseBlockView block={segment.block} isPending={segment.isPending} />
        </motion.div>
      );
    case 'activity':
      return (
        <ActivityGroup
          blocks={segment.blocks}
          startIndex={segment.startIndex}
          isStreaming={isStreaming}
          isLastGroup={segment.isLastGroup}
        />
      );
    case 'text':
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <TextBlockView block={segment.block} />
        </motion.div>
      );
    case 'streaming':
      return (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 border-t border-white/5"
        >
          <StreamingIndicator />
        </motion.div>
      );
  }
}

export function AssistantBlocks({
  blocks,
  isStreaming,
}: {
  blocks: ContentBlock[];
  isStreaming: boolean;
}) {
  if (blocks.length === 0 && isStreaming) {
    return <StreamingIndicator />;
  }

  const segments = useMemo(() => computeBlockSegments(blocks, isStreaming), [blocks, isStreaming]);

  if (segments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {segments.map((segment) => (
        <BlockSegmentView key={segmentKey(segment)} segment={segment} isStreaming={isStreaming} />
      ))}
    </div>
  );
}
