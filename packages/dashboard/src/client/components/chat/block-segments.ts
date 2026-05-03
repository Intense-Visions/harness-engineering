import type { ContentBlock, ToolUseBlock, TextBlock } from '../../types/chat';

/** Check if a tool_use block is a "container" type (agent/subagent/skill). */
export function isContainerTool(tool: string): boolean {
  const t = tool.toLowerCase();
  return t === 'agent' || t === 'subagent' || t === 'skill' || t.startsWith('harness:');
}

/** Check if text content appears to be log/terminal output rather than conversational prose. */
export function isLogOutput(text: string, _tool?: string): boolean {
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

// ── Segment types ──────────────────────────────────────────────────

export type BlockSegment =
  | {
      kind: 'agent';
      block: ToolUseBlock;
      childBlocks: ContentBlock[];
      childStartIndex: number;
      childIsLastGroup: boolean;
      index: number;
    }
  | { kind: 'todo'; block: ToolUseBlock; index: number }
  | { kind: 'interaction'; block: ToolUseBlock; index: number; isPending: boolean }
  | {
      kind: 'activity';
      blocks: ContentBlock[];
      startIndex: number;
      isLastGroup: boolean;
    }
  | { kind: 'text'; block: TextBlock; index: number }
  | { kind: 'streaming' };

// ── Helpers ────────────────────────────────────────────────────────

function isTodoTool(toolLower: string): boolean {
  return toolLower.includes('todo');
}

function isInteractionTool(toolLower: string): boolean {
  return (
    toolLower.includes('interaction') ||
    toolLower.includes('question') ||
    toolLower.includes('ask') ||
    toolLower.includes('human')
  );
}

/** Returns true if this tool_use block should break child collection. */
function isChildBreakingTool(b: ContentBlock): boolean {
  if (b.kind !== 'tool_use') return false;
  if (isContainerTool(b.tool)) return true;
  const t = b.tool.toLowerCase();
  return isTodoTool(t) || isInteractionTool(t);
}

function collectChildIndices(
  blocks: ContentBlock[],
  consumedIndices: Set<number>,
  agentIdx: number
): number[] {
  const children: number[] = [];
  for (let j = agentIdx + 1; j < blocks.length; j++) {
    if (consumedIndices.has(j)) continue;
    const b = blocks[j]!;
    if (isChildBreakingTool(b)) break;
    if (b.kind === 'text' && !isLogOutput(b.text)) break;
    children.push(j);
  }
  return children;
}

/**
 * Walk forward from a tool_use block, collecting adjacent text/status output
 * that should be merged into the tool's result. Returns the merged block and
 * marks consumed indices in `consumed`.
 *
 * `eligible` constrains which indices may be consumed (pass `undefined` to
 * allow all indices up to `blocks.length`).
 */
function mergeFollowingOutput(
  blocks: ContentBlock[],
  toolBlock: ToolUseBlock,
  startIdx: number,
  consumed: Set<number>,
  eligible?: number[]
): ToolUseBlock {
  const chunks: string[] = [];
  let look = startIdx;
  const inRange = (idx: number) => (eligible ? eligible.includes(idx) : idx < blocks.length);

  while (inRange(look)) {
    if (consumed.has(look)) {
      look++;
      continue;
    }
    const nextB = blocks[look]!;
    if (nextB.kind === 'tool_use' || nextB.kind === 'thinking') break;
    if (nextB.kind === 'text') {
      if (isLogOutput(nextB.text, toolBlock.tool)) {
        chunks.push(nextB.text);
        consumed.add(look);
      } else {
        break;
      }
    } else if (nextB.kind === 'status') {
      chunks.push(nextB.text);
      consumed.add(look);
    }
    look++;
  }

  if (chunks.length === 0) return toolBlock;
  const merged = chunks.join('\n\n');
  return {
    ...toolBlock,
    result: toolBlock.result ? `${merged}\n\n${toolBlock.result}` : merged,
  } as ToolUseBlock;
}

function processChildBlocks(blocks: ContentBlock[], childIndices: number[]): ContentBlock[] {
  const childBlocks: ContentBlock[] = [];
  const innerConsumed = new Set<number>();

  for (const idx of childIndices) {
    if (innerConsumed.has(idx)) continue;
    const block = blocks[idx]!;

    if (block.kind === 'tool_use') {
      childBlocks.push(mergeFollowingOutput(blocks, block, idx + 1, innerConsumed, childIndices));
    } else {
      childBlocks.push(block);
    }
  }

  return childBlocks;
}

/** Mark the last activity segment in the list (if any). */
function markLastActivitySegment(segments: BlockSegment[]): void {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]!.kind === 'activity') {
      (segments[i] as Extract<BlockSegment, { kind: 'activity' }>).isLastGroup = true;
      return;
    }
  }
}

// ── Per-block-kind handlers ───────────────────────────────────────

interface LoopState {
  blocks: ContentBlock[];
  segments: BlockSegment[];
  consumedIndices: Set<number>;
  activityGroup: ContentBlock[];
  activityGroupStart: number;
  isStreaming: boolean;
}

function flushActivityGroup(state: LoopState): void {
  if (state.activityGroup.length === 0) return;
  state.segments.push({
    kind: 'activity',
    blocks: state.activityGroup,
    startIndex: state.activityGroupStart,
    isLastGroup: false,
  });
  state.activityGroup = [];
}

function addToActivityGroup(state: LoopState, block: ContentBlock, index: number): void {
  if (state.activityGroup.length === 0) state.activityGroupStart = index;
  state.activityGroup.push(block);
}

function handleContainerTool(state: LoopState, block: ToolUseBlock, i: number): void {
  flushActivityGroup(state);
  const childIndices = collectChildIndices(state.blocks, state.consumedIndices, i);
  childIndices.forEach((idx) => state.consumedIndices.add(idx));
  const childBlocks = processChildBlocks(state.blocks, childIndices);
  state.segments.push({
    kind: 'agent',
    block,
    childBlocks,
    childStartIndex: childIndices[0] ?? i + 1,
    childIsLastGroup:
      childIndices.length > 0 && childIndices[childIndices.length - 1] === state.blocks.length - 1,
    index: i,
  });
}

function handleTodoTool(state: LoopState, block: ToolUseBlock, i: number): void {
  flushActivityGroup(state);
  state.segments.push({ kind: 'todo', block, index: i });
}

function handleInteractionTool(state: LoopState, block: ToolUseBlock, i: number): void {
  flushActivityGroup(state);
  state.segments.push({
    kind: 'interaction',
    block,
    index: i,
    isPending: state.isStreaming && i === state.blocks.length - 1,
  });
}

function handleRegularTool(state: LoopState, block: ToolUseBlock, i: number): void {
  const merged = mergeFollowingOutput(state.blocks, block, i + 1, state.consumedIndices, undefined);
  addToActivityGroup(state, merged, i);
}

function handleToolUse(state: LoopState, block: ToolUseBlock, i: number): void {
  const t = block.tool.toLowerCase();
  if (isContainerTool(block.tool)) return handleContainerTool(state, block, i);
  if (isTodoTool(t)) return handleTodoTool(state, block, i);
  if (isInteractionTool(t)) return handleInteractionTool(state, block, i);
  handleRegularTool(state, block, i);
}

function handleBlock(state: LoopState, block: ContentBlock, i: number): void {
  if (block.kind === 'tool_use') {
    handleToolUse(state, block as ToolUseBlock, i);
  } else if (block.kind === 'thinking' || block.kind === 'status') {
    addToActivityGroup(state, block, i);
  } else if (block.kind === 'text' && isLogOutput(block.text)) {
    addToActivityGroup(state, block, i);
  } else {
    flushActivityGroup(state);
    state.segments.push({ kind: 'text', block: block as TextBlock, index: i });
  }
}

// ── Main computation ───────────────────────────────────────────────

/**
 * Splits a flat ContentBlock[] into logical segments that can be rendered
 * independently — suitable for virtualized list rendering.
 */
export function computeBlockSegments(blocks: ContentBlock[], isStreaming: boolean): BlockSegment[] {
  if (blocks.length === 0) return [];

  const state: LoopState = {
    blocks,
    segments: [],
    consumedIndices: new Set<number>(),
    activityGroup: [],
    activityGroupStart: 0,
    isStreaming,
  };

  for (let i = 0; i < blocks.length; i++) {
    if (state.consumedIndices.has(i)) continue;
    handleBlock(state, blocks[i]!, i);
  }

  // Flush final activity group (mark as last)
  if (state.activityGroup.length > 0) {
    state.segments.push({
      kind: 'activity',
      blocks: state.activityGroup,
      startIndex: state.activityGroupStart,
      isLastGroup: true,
    });
  } else {
    markLastActivitySegment(state.segments);
  }

  if (isStreaming) {
    state.segments.push({ kind: 'streaming' });
  }

  return state.segments;
}

/** Stable key for a segment, based on its block index or kind. */
export function segmentKey(segment: BlockSegment): string {
  switch (segment.kind) {
    case 'agent':
      return `agent-${segment.index}`;
    case 'todo':
      return `todo-${segment.index}`;
    case 'interaction':
      return `interaction-${segment.index}`;
    case 'activity':
      return `ag-${segment.startIndex}`;
    case 'text':
      return `text-${segment.index}`;
    case 'streaming':
      return 'streaming';
  }
}
