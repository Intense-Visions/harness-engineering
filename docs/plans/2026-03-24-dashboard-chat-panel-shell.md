# Plan: Dashboard Chat Panel Shell — Layout Integration

**Date:** 2026-03-24 | **Spec:** `docs/changes/dashboard-chat-panel/proposal.md` | **Tasks:** 9 | **Time:** 45 min

## Goal

Integrate a collapsible chat panel shell into the dashboard layout that persists across pages and handles layout resizing.

## Observable Truths (Acceptance Criteria)

1. The dashboard layout has a persistent trigger button to toggle the chat panel.
2. Opening the chat panel shrinks the main page content to accommodate a 420px wide panel.
3. Chat panel open/closed state is persisted in `localStorage` as `chat-panel-open`.
4. Message and block rendering components are extracted from `Chat.tsx` and used by both the page and the panel.
5. `harness validate` passes and the dashboard builds successfully.

## File Map

- CREATE `packages/dashboard/src/client/types/chat.ts`
- CREATE `packages/dashboard/src/client/utils/chat-stream.ts`
- CREATE `packages/dashboard/src/client/components/chat/AssistantBlocks.tsx`
- CREATE `packages/dashboard/src/client/components/chat/ChatInput.tsx`
- CREATE `packages/dashboard/src/client/components/chat/MessageStream.tsx`
- CREATE `packages/dashboard/src/client/hooks/useChatPanel.ts`
- CREATE `packages/dashboard/src/client/components/chat/ChatPanel.tsx`
- CREATE `packages/dashboard/src/client/components/chat/ChatPanelTrigger.tsx`
- MODIFY `packages/dashboard/src/client/pages/Chat.tsx`
- MODIFY `packages/dashboard/src/client/components/Layout.tsx`

## Skeleton

1. Core Types and Utilities (~2 tasks, ~10 min)
   - `chat.ts` types, `chat-stream.ts` extraction.
2. Component Extraction (~3 tasks, ~15 min)
   - `AssistantBlocks.tsx`, `ChatInput.tsx`, `MessageStream.tsx`.
3. Refactor Existing Chat (~1 task, ~5 min)
   - Update `Chat.tsx` to use extracted parts.
4. Layout and Panel Integration (~3 tasks, ~15 min)
   - `useChatPanel` hook, `ChatPanel` and `ChatPanelTrigger` shell, `Layout.tsx` flex integration.
     **Estimated total:** 9 tasks, ~45 minutes

## Tasks

### Task 1: Define Chat Types

**Files:** `packages/dashboard/src/client/types/chat.ts`

1. Create `packages/dashboard/src/client/types/chat.ts` with the following content:

```typescript
export interface ThinkingBlock {
  kind: 'thinking';
  text: string;
}

export interface ToolUseBlock {
  kind: 'tool_use';
  tool: string;
  args?: string;
  result?: string;
  isError?: boolean;
}

export interface StatusBlock {
  kind: 'status';
  text: string;
}

export interface TextBlock {
  kind: 'text';
  text: string;
}

export type ContentBlock = ThinkingBlock | ToolUseBlock | StatusBlock | TextBlock;

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  blocks: ContentBlock[];
}

export type ChatMessage = UserMessage | AssistantMessage;
```

2. Run: `harness validate`
3. Commit: `feat(chat): define chat message and block types`

### Task 2: Extract Chat Stream Logic

**Files:** `packages/dashboard/src/client/utils/chat-stream.ts`

1. Create `packages/dashboard/src/client/utils/chat-stream.ts`:

```typescript
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
  if (event.type === 'session') return;
  if (event.type === 'error') return;

  const lastBlock = blocks[blocks.length - 1];

  if (event.type === 'text') {
    if (lastBlock?.kind === 'text') {
      blocks[blocks.length - 1] = { kind: 'text', text: lastBlock.text + event.text };
    } else {
      if (lastBlock?.kind === 'status') blocks.pop();
      blocks.push({ kind: 'text', text: event.text });
    }
  } else if (event.type === 'thinking') {
    if (lastBlock?.kind === 'thinking') {
      blocks[blocks.length - 1] = { kind: 'thinking', text: lastBlock.text + event.text };
    } else {
      blocks.push({ kind: 'thinking', text: event.text });
    }
  } else if (event.type === 'tool_use') {
    blocks.push({ kind: 'tool_use', tool: event.tool, args: event.args });
  } else if (event.type === 'tool_result') {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]!;
      if (b.kind === 'tool_use' && b.result === undefined) {
        blocks[i] = { ...b, result: event.content, isError: event.isError };
        break;
      }
    }
  } else if (event.type === 'status') {
    if (lastBlock?.kind === 'status') {
      blocks[blocks.length - 1] = { kind: 'status', text: event.text };
    } else {
      blocks.push({ kind: 'status', text: event.text });
    }
  }
}
```

2. Run: `harness validate`
3. Commit: `feat(chat): extract streamChat and applyChunk logic`

### Task 3: Extract AssistantBlocks Component

**Files:** `packages/dashboard/src/client/components/chat/AssistantBlocks.tsx`

1. Create `packages/dashboard/src/client/components/chat/AssistantBlocks.tsx` and move all block rendering components from `Chat.tsx` into it. Ensure all imports are correct.
2. Run: `harness validate`
3. Commit: `feat(chat): extract AssistantBlocks component`

### Task 4: Extract ChatInput Component

**Files:** `packages/dashboard/src/client/components/chat/ChatInput.tsx`

1. Create `packages/dashboard/src/client/components/chat/ChatInput.tsx`:

```typescript
import { Send } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}

export function ChatInput({ value, onChange, onSend, disabled, placeholder }: Props) {
  return (
    <div className="relative">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder ?? "Execute command or query neural link..."}
        disabled={disabled}
        className="w-full resize-none rounded-2xl border border-neutral-border bg-neutral-surface/60 px-5 py-4 pr-14 text-sm text-neutral-text placeholder-neutral-muted/50 backdrop-blur-xl transition-all focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 disabled:opacity-50 shadow-lg"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-primary-500 p-2.5 text-white transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 shadow-[0_0_15px_rgba(79,70,229,0.3)]"
      >
        {disabled ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Send size={18} />
        )}
      </button>
    </div>
  );
}
```

2. Run: `harness validate`
3. Commit: `feat(chat): extract ChatInput component`

### Task 5: Create MessageStream Component

**Files:** `packages/dashboard/src/client/components/chat/MessageStream.tsx`

1. Create `packages/dashboard/src/client/components/chat/MessageStream.tsx` using `Virtuoso`, `motion`, and `AssistantBlocks`.
2. Run: `harness validate`
3. Commit: `feat(chat): create MessageStream component`

### Task 6: Refactor Chat.tsx

**Files:** `packages/dashboard/src/client/pages/Chat.tsx`

1. Refactor `Chat.tsx` to use the new types, components, and utils.
2. Run: `harness validate`
3. Commit: `refactor(chat): use extracted chat components and utils`

### Task 7: Create useChatPanel Hook

**Files:** `packages/dashboard/src/client/hooks/useChatPanel.ts`

1. Create `packages/dashboard/src/client/hooks/useChatPanel.ts` with `localStorage` persistence.
2. Run: `harness validate`
3. Commit: `feat(chat): create useChatPanel hook`

### Task 8: Create ChatPanel and ChatPanelTrigger

**Files:** `packages/dashboard/src/client/components/chat/ChatPanel.tsx`, `packages/dashboard/src/client/components/chat/ChatPanelTrigger.tsx`

1. Create `ChatPanel` component.
2. Create `ChatPanelTrigger` component.
3. Run: `harness validate`
4. Commit: `feat(chat): create chat panel and trigger components`

### Task 9: Integrate Chat Panel into Layout

**Files:** `packages/dashboard/src/client/components/Layout.tsx`

1. Update `Layout.tsx` to implement a flex row container when the chat panel is open.
2. Use `AnimatePresence` for panel transitions.
3. Ensure the main content area resizes correctly.
4. Run: `harness validate`
5. Commit: `feat(layout): integrate chat side panel and resize content`
