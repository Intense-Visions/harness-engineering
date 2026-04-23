import type { ChatSSEEvent } from '../types/orchestrator';
import type { ContentBlock } from '../types/chat';

export interface StreamCallbacks {
  onSession: (sessionId: string) => void;
  onChunk: (event: ChatSSEEvent) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamChat(
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
          // harness-ignore SEC-DES-001: parsing own orchestrator server SSE events — trusted internal source, wrapped in try-catch
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

export function applyChunk(blocks: ContentBlock[], event: ChatSSEEvent): void {
  if (event.type === 'session' || event.type === 'error') return;

  const lastBlock = blocks[blocks.length - 1];

  switch (event.type) {
    case 'text':
      handleTextBlock(blocks, lastBlock, event.text);
      break;
    case 'thinking':
      handleThinkingBlock(blocks, lastBlock, event.text);
      break;
    case 'tool_use':
      blocks.push({
        kind: 'tool_use',
        tool: event.tool,
        ...(event.args != null ? { args: event.args } : {}),
      });
      break;
    case 'tool_args_delta':
      handleToolArgsDeltaBlock(blocks, event.text);
      break;
    case 'tool_result':
      handleToolResultBlock(blocks, event.content, event.isError);
      break;
    case 'status':
      handleStatusBlock(blocks, lastBlock, event.text);
      break;
  }
}

function handleTextBlock(
  blocks: ContentBlock[],
  lastBlock: ContentBlock | undefined,
  text: string
) {
  if (lastBlock?.kind === 'text') {
    blocks[blocks.length - 1] = { kind: 'text', text: lastBlock.text + text };
  } else {
    if (lastBlock?.kind === 'status') blocks.pop();
    blocks.push({ kind: 'text', text });
  }
}

function handleThinkingBlock(
  blocks: ContentBlock[],
  lastBlock: ContentBlock | undefined,
  text: string
) {
  if (lastBlock?.kind === 'thinking') {
    blocks[blocks.length - 1] = { kind: 'thinking', text: lastBlock.text + text };
  } else {
    blocks.push({ kind: 'thinking', text });
  }
}

function handleToolArgsDeltaBlock(blocks: ContentBlock[], text: string) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.kind === 'tool_use' && b.result === undefined) {
      blocks[i] = { ...b, args: (b.args ?? '') + text };
      break;
    }
  }
}

function handleToolResultBlock(blocks: ContentBlock[], content: string, isError?: boolean) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.kind === 'tool_use' && b.result === undefined) {
      blocks[i] = { ...b, result: content, ...(isError != null ? { isError } : {}) };
      break;
    }
  }
}

function handleStatusBlock(
  blocks: ContentBlock[],
  lastBlock: ContentBlock | undefined,
  text: string
) {
  if (lastBlock?.kind === 'status') {
    blocks[blocks.length - 1] = { kind: 'status', text };
  } else {
    blocks.push({ kind: 'status', text });
  }
}
