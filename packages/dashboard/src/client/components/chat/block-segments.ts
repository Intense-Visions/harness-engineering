import type { ContentBlock, ToolUseBlock, TextBlock } from '../../types/chat';

/** Check if a tool_use block is a "container" type (agent/subagent/skill). */
export function isContainerTool(tool: string): boolean {
  const t = tool.toLowerCase();
  return t === 'agent' || t === 'subagent' || t === 'skill' || t.startsWith('harness:');
}

/** Check if text content appears to be log/terminal output rather than conversational prose. */
export function isLogOutput(text: string, tool?: string): boolean {
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

function collectChildIndices(
  blocks: ContentBlock[],
  consumedIndices: Set<number>,
  agentIdx: number
): number[] {
  const children: number[] = [];
  for (let j = agentIdx + 1; j < blocks.length; j++) {
    if (consumedIndices.has(j)) continue;
    const b = blocks[j]!;
    if (b.kind === 'tool_use') {
      if (isContainerTool(b.tool)) break;
      const t = b.tool.toLowerCase();
      if (t.includes('todo')) break;
      if (
        t.includes('interaction') ||
        t.includes('question') ||
        t.includes('ask') ||
        t.includes('human')
      )
        break;
    }
    if (b.kind === 'text' && !isLogOutput(b.text)) break;
    children.push(j);
  }
  return children;
}

function processChildBlocks(blocks: ContentBlock[], childIndices: number[]): ContentBlock[] {
  const childBlocks: ContentBlock[] = [];
  const innerConsumed = new Set<number>();

  for (const idx of childIndices) {
    if (innerConsumed.has(idx)) continue;
    let block = blocks[idx]!;

    if (block.kind === 'tool_use') {
      const forceResultChunks: string[] = [];
      let lookAhead = idx + 1;
      while (lookAhead < blocks.length && childIndices.includes(lookAhead)) {
        if (innerConsumed.has(lookAhead)) {
          lookAhead++;
          continue;
        }
        const nextB = blocks[lookAhead]!;
        if (nextB.kind === 'tool_use' || nextB.kind === 'thinking') break;
        if (nextB.kind === 'text') {
          if (isLogOutput(nextB.text, block.tool)) {
            forceResultChunks.push(nextB.text);
            innerConsumed.add(lookAhead);
          } else {
            break;
          }
        } else if (nextB.kind === 'status') {
          forceResultChunks.push(nextB.text);
          innerConsumed.add(lookAhead);
        }
        lookAhead++;
      }
      if (forceResultChunks.length > 0) {
        const chunkString = forceResultChunks.join('\n\n');
        block = {
          ...block,
          result: block.result ? `${chunkString}\n\n${block.result}` : chunkString,
        } as ToolUseBlock;
      }
    }

    childBlocks.push(block);
  }

  return childBlocks;
}

// ── Main computation ───────────────────────────────────────────────

/**
 * Splits a flat ContentBlock[] into logical segments that can be rendered
 * independently — suitable for virtualized list rendering.
 */
export function computeBlockSegments(blocks: ContentBlock[], isStreaming: boolean): BlockSegment[] {
  if (blocks.length === 0) return [];

  const segments: BlockSegment[] = [];
  const consumedIndices = new Set<number>();

  let activityGroup: ContentBlock[] = [];
  let activityGroupStart = 0;

  const flushActivityGroup = () => {
    if (activityGroup.length === 0) return;
    segments.push({
      kind: 'activity',
      blocks: activityGroup,
      startIndex: activityGroupStart,
      isLastGroup: false,
    });
    activityGroup = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    if (consumedIndices.has(i)) continue;
    let block = blocks[i]!;

    if (block.kind === 'tool_use') {
      const t = block.tool.toLowerCase();

      // Container tools: agent/subagent/skill
      if (isContainerTool(block.tool)) {
        flushActivityGroup();
        const childIndices = collectChildIndices(blocks, consumedIndices, i);
        childIndices.forEach((idx) => consumedIndices.add(idx));
        const childBlocks = processChildBlocks(blocks, childIndices);
        segments.push({
          kind: 'agent',
          block: block as ToolUseBlock,
          childBlocks,
          childStartIndex: childIndices[0] ?? i + 1,
          childIsLastGroup:
            childIndices.length > 0 && childIndices[childIndices.length - 1] === blocks.length - 1,
          index: i,
        });
        continue;
      }

      // Todo blocks
      if (t.includes('todo')) {
        flushActivityGroup();
        segments.push({ kind: 'todo', block: block as ToolUseBlock, index: i });
        continue;
      }

      // Interaction blocks
      if (
        t.includes('interaction') ||
        t.includes('question') ||
        t.includes('ask') ||
        t.includes('human')
      ) {
        flushActivityGroup();
        segments.push({
          kind: 'interaction',
          block: block as ToolUseBlock,
          index: i,
          isPending: isStreaming && i === blocks.length - 1,
        });
        continue;
      }

      // Regular tool_use: pair with following text/status output
      const forceResultChunks: string[] = [];
      let lookAhead = i + 1;
      while (lookAhead < blocks.length) {
        if (consumedIndices.has(lookAhead)) {
          lookAhead++;
          continue;
        }
        const nextB = blocks[lookAhead]!;
        if (nextB.kind === 'tool_use' || nextB.kind === 'thinking') break;
        if (nextB.kind === 'text') {
          if (isLogOutput(nextB.text, block.tool)) {
            forceResultChunks.push(nextB.text);
            consumedIndices.add(lookAhead);
          } else {
            break;
          }
        } else if (nextB.kind === 'status') {
          forceResultChunks.push(nextB.text);
          consumedIndices.add(lookAhead);
        }
        lookAhead++;
      }
      if (forceResultChunks.length > 0) {
        const chunkString = forceResultChunks.join('\n\n');
        block = {
          ...block,
          result: (block as ToolUseBlock).result
            ? `${chunkString}\n\n${(block as ToolUseBlock).result}`
            : chunkString,
        } as ToolUseBlock;
      }

      if (activityGroup.length === 0) activityGroupStart = i;
      activityGroup.push(block);
    } else if (block.kind === 'thinking' || block.kind === 'status') {
      if (activityGroup.length === 0) activityGroupStart = i;
      activityGroup.push(block);
    } else if (block.kind === 'text' && isLogOutput(block.text)) {
      if (activityGroup.length === 0) activityGroupStart = i;
      activityGroup.push(block);
    } else {
      // Conversational text
      flushActivityGroup();
      segments.push({ kind: 'text', block: block as TextBlock, index: i });
    }
  }

  // Flush final activity group (mark as last)
  if (activityGroup.length > 0) {
    segments.push({
      kind: 'activity',
      blocks: activityGroup,
      startIndex: activityGroupStart,
      isLastGroup: true,
    });
  } else {
    // Find and mark the last activity segment
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i]!.kind === 'activity') {
        (segments[i] as Extract<BlockSegment, { kind: 'activity' }>).isLastGroup = true;
        break;
      }
    }
  }

  // Add streaming indicator
  if (isStreaming) {
    segments.push({ kind: 'streaming' });
  }

  return segments;
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
