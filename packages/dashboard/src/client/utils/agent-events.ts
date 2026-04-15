import type { ContentBlock } from '../types/chat';
import type { AgentEventMessage } from '../types/orchestrator';

function resolveContent(msg: AgentEventMessage['event']): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content ? String(msg.content) : '';
}

function handleText(blocks: ContentBlock[], content: string): void {
  const last = blocks[blocks.length - 1];
  if (last?.kind === 'text') {
    blocks[blocks.length - 1] = { kind: 'text', text: last.text + content };
  } else {
    if (last?.kind === 'status') blocks.pop();
    blocks.push({ kind: 'text', text: content });
  }
}

function handleThought(blocks: ContentBlock[], content: string): void {
  const last = blocks[blocks.length - 1];
  if (last?.kind === 'thinking') {
    blocks[blocks.length - 1] = { kind: 'thinking', text: last.text + content };
  } else {
    blocks.push({ kind: 'thinking', text: content });
  }
}

function handleCall(blocks: ContentBlock[], content: string): void {
  const match = content.match(/^Calling (\S+)\(([\s\S]*)\)$/);
  if (match) {
    blocks.push({
      kind: 'tool_use',
      tool: match[1]!,
      ...(match[2] != null ? { args: match[2] } : {}),
    });
  } else {
    blocks.push({ kind: 'tool_use', tool: content });
  }
}

function handleStatus(blocks: ContentBlock[], content: string): void {
  const last = blocks[blocks.length - 1];
  if (last?.kind === 'status') {
    blocks[blocks.length - 1] = { kind: 'status', text: content };
  } else {
    blocks.push({ kind: 'status', text: content });
  }
}

/**
 * Coalesce an incoming agent event into an existing ContentBlock array.
 * Consecutive text/thought events are merged into a single block to avoid
 * one-block-per-SSE-chunk explosion. Mirrors the applyChunk() pattern
 * used by the chat stream utility.
 */
export function applyAgentEvent(blocks: ContentBlock[], msg: AgentEventMessage['event']): void {
  const content = resolveContent(msg);

  switch (msg.type) {
    case 'text':
      handleText(blocks, content);
      break;
    case 'thought':
      handleThought(blocks, content);
      break;
    case 'call':
      handleCall(blocks, content);
      break;
    case 'result':
      if (content) blocks.push({ kind: 'text', text: content });
      break;
    case 'rate_limit':
      blocks.push({ kind: 'status', text: 'Rate limit — cooling down...' });
      break;
    case 'status':
      handleStatus(blocks, content);
      break;
    case 'turn_start':
      break;
    default:
      if (content) blocks.push({ kind: 'status', text: content });
      break;
  }
}
