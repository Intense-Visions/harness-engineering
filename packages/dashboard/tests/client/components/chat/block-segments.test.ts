import { describe, it, expect } from 'vitest';
import {
  isContainerTool,
  isLogOutput,
  computeBlockSegments,
  segmentKey,
  type BlockSegment,
} from '../../../../src/client/components/chat/block-segments';
import type {
  ContentBlock,
  ToolUseBlock,
  TextBlock,
  StatusBlock,
  ThinkingBlock,
} from '../../../../src/client/types/chat';

// ── Block factories (keep test fixtures explicit and typed) ──────────

function tool(t: string, extra: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return { kind: 'tool_use', tool: t, ...extra };
}
function text(t: string): TextBlock {
  return { kind: 'text', text: t };
}
function status(t: string): StatusBlock {
  return { kind: 'status', text: t };
}
function thinking(t: string): ThinkingBlock {
  return { kind: 'thinking', text: t };
}

// A line that reliably trips isLogOutput's `/^>\s/` marker.
const LOG_LINE = '> npm run build';
// Prose that trips no log markers.
const PROSE = 'Here is the answer to your question.';

describe('isContainerTool', () => {
  it('classifies the fixed container tool names case-insensitively', () => {
    expect(isContainerTool('agent')).toBe(true);
    expect(isContainerTool('SubAgent')).toBe(true);
    expect(isContainerTool('SKILL')).toBe(true);
  });

  it('classifies any harness-prefixed tool as a container', () => {
    expect(isContainerTool('harness:orchestrator')).toBe(true);
    expect(isContainerTool('HARNESS:analyze')).toBe(true);
  });

  it('does not classify ordinary tools as containers', () => {
    expect(isContainerTool('Bash')).toBe(false);
    expect(isContainerTool('Read')).toBe(false);
    expect(isContainerTool('subagentic')).toBe(false);
  });
});

describe('isLogOutput', () => {
  it('flags terminal-style lines as log output', () => {
    expect(isLogOutput('> npm run build')).toBe(true);
    expect(isLogOutput('$ ls -la')).toBe(true);
  });

  it('flags source-code-style lines as log output', () => {
    expect(isLogOutput("import { x } from './y'")).toBe(true);
  });

  it('treats conversational prose as non-log', () => {
    expect(isLogOutput(PROSE)).toBe(false);
    expect(isLogOutput('This is a normal sentence with no markers')).toBe(false);
  });

  it('flags a block when any single line matches a marker', () => {
    const mixed = ['normal prose line', LOG_LINE, 'more prose'].join('\n');
    expect(isLogOutput(mixed)).toBe(true);
  });
});

describe('computeBlockSegments', () => {
  it('returns no segments for an empty block list', () => {
    expect(computeBlockSegments([], false)).toEqual([]);
  });

  it('emits a standalone text segment for conversational text', () => {
    const block = text('Hello there.');
    const segments = computeBlockSegments([block], false);
    expect(segments).toEqual([{ kind: 'text', block, index: 0 }]);
  });

  it('groups a lone regular tool_use into a final activity segment', () => {
    const block = tool('Bash', { args: 'ls' });
    const segments = computeBlockSegments([block], false);
    expect(segments).toEqual([
      { kind: 'activity', blocks: [block], startIndex: 0, isLastGroup: true },
    ]);
  });

  it('merges following log output into a regular tool result', () => {
    const blocks: ContentBlock[] = [tool('Bash', { result: 'existing' }), text(LOG_LINE)];
    const segments = computeBlockSegments(blocks, false);

    expect(segments).toHaveLength(1);
    const activity = segments[0] as Extract<BlockSegment, { kind: 'activity' }>;
    expect(activity.kind).toBe('activity');
    expect(activity.blocks).toHaveLength(1);
    const merged = activity.blocks[0] as ToolUseBlock;
    // Merged log output is prepended to the pre-existing result.
    expect(merged.result).toBe(`${LOG_LINE}\n\nexisting`);
  });

  it('merges an adjacent status block into the tool result', () => {
    const blocks: ContentBlock[] = [tool('Bash'), status('running tests')];
    const segments = computeBlockSegments(blocks, false);

    const activity = segments[0] as Extract<BlockSegment, { kind: 'activity' }>;
    const merged = activity.blocks[0] as ToolUseBlock;
    expect(merged.result).toBe('running tests');
  });

  it('does not merge conversational text and splits it into its own text segment', () => {
    const toolBlock = tool('Bash');
    const proseBlock = text(PROSE);
    const segments = computeBlockSegments([toolBlock, proseBlock], false);

    expect(segments).toEqual([
      { kind: 'activity', blocks: [toolBlock], startIndex: 0, isLastGroup: true },
      { kind: 'text', block: proseBlock, index: 1 },
    ]);
  });

  it('emits an agent segment for a container tool and folds log children in', () => {
    const agent = tool('agent');
    const child = text(LOG_LINE);
    const segments = computeBlockSegments([agent, child], false);

    expect(segments).toHaveLength(1);
    const seg = segments[0] as Extract<BlockSegment, { kind: 'agent' }>;
    expect(seg.kind).toBe('agent');
    expect(seg.block).toBe(agent);
    expect(seg.index).toBe(0);
    expect(seg.childBlocks).toEqual([child]);
    expect(seg.childStartIndex).toBe(1);
    expect(seg.childIsLastGroup).toBe(true);
  });

  it('stops agent child collection at a conversational text block', () => {
    const agent = tool('agent');
    const prose = text(PROSE);
    const segments = computeBlockSegments([agent, prose], false);

    const seg = segments[0] as Extract<BlockSegment, { kind: 'agent' }>;
    expect(seg.kind).toBe('agent');
    // Prose breaks child collection, so it becomes its own text segment.
    expect(seg.childBlocks).toEqual([]);
    expect(segments[1]).toEqual({ kind: 'text', block: prose, index: 1 });
  });

  it('emits a todo segment for a todo tool', () => {
    const todo = tool('TodoWrite');
    const segments = computeBlockSegments([todo], false);
    expect(segments).toEqual([{ kind: 'todo', block: todo, index: 0 }]);
  });

  it('marks a trailing interaction tool as pending only while streaming', () => {
    const ask = tool('ask_human');

    const streaming = computeBlockSegments([ask], true);
    expect(streaming[0]).toEqual({ kind: 'interaction', block: ask, index: 0, isPending: true });
    // Streaming also appends a trailing streaming segment.
    expect(streaming[streaming.length - 1]).toEqual({ kind: 'streaming' });

    const settled = computeBlockSegments([ask], false);
    expect(settled).toEqual([{ kind: 'interaction', block: ask, index: 0, isPending: false }]);
  });

  it('groups thinking blocks into activity segments', () => {
    const think = thinking('pondering');
    const segments = computeBlockSegments([think], false);
    expect(segments).toEqual([
      { kind: 'activity', blocks: [think], startIndex: 0, isLastGroup: true },
    ]);
  });
});

describe('segmentKey', () => {
  it('derives a stable, index-scoped key for each segment kind', () => {
    const toolBlock = tool('Bash');
    const textBlock = text('hi');

    expect(
      segmentKey({
        kind: 'agent',
        block: toolBlock,
        childBlocks: [],
        childStartIndex: 1,
        childIsLastGroup: false,
        index: 3,
      })
    ).toBe('agent-3');
    expect(segmentKey({ kind: 'todo', block: toolBlock, index: 4 })).toBe('todo-4');
    expect(segmentKey({ kind: 'interaction', block: toolBlock, index: 5, isPending: false })).toBe(
      'interaction-5'
    );
    expect(segmentKey({ kind: 'activity', blocks: [], startIndex: 6, isLastGroup: false })).toBe(
      'ag-6'
    );
    expect(segmentKey({ kind: 'text', block: textBlock, index: 7 })).toBe('text-7');
    expect(segmentKey({ kind: 'streaming' })).toBe('streaming');
  });
});
