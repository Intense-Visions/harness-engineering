import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

import { ChatThreadView } from '../../../../src/client/components/threads/ChatThreadView';
import { useThreadStore } from '../../../../src/client/stores/threadStore';
import { streamChat } from '../../../../src/client/utils/chat-stream';
import { generateSystemPrompt } from '../../../../src/client/utils/context-to-prompt';
import type { Thread, ChatMeta } from '../../../../src/client/types/thread';
import type { AssistantMessage, UserMessage } from '../../../../src/client/types/chat';

// ── Stub heavy leaf components so the test targets ChatThreadView's own
//    orchestration (view routing + streaming/send effects), not their internals.

vi.mock('../../../../src/client/components/chat/NeuralOrganism', () => ({
  NeuralOrganism: () => <div data-testid="neural-organism" />,
}));

vi.mock('../../../../src/client/components/chat/MessageStream', () => ({
  MessageStream: ({ messages, streaming }: { messages: unknown[]; streaming: boolean }) => (
    <div
      data-testid="message-stream"
      data-count={messages.length}
      data-streaming={String(streaming)}
    />
  ),
}));

vi.mock('../../../../src/client/components/chat/ChatInput', () => ({
  ChatInput: ({
    value,
    onChange,
    onSend,
    disabled,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    disabled: boolean;
    placeholder?: string;
  }) => (
    <div>
      <input
        data-testid="chat-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button data-testid="chat-send" disabled={disabled} onClick={onSend}>
        send
      </button>
    </div>
  ),
}));

// The palette selects a real registry skill so downstream skill-resolution behaves.
const PALETTE_SKILL_ID = 'harness:validate';
const PALETTE_SKILL_NAME = 'Validate Project';
const PALETTE_SLASH = '/harness:validate';

vi.mock('../../../../src/client/components/chat/CommandPalette', () => ({
  CommandPalette: ({ onSelect }: { onSelect: (skill: unknown) => void }) => (
    <button
      data-testid="palette-select"
      onClick={() =>
        onSelect({
          id: 'harness:validate',
          name: 'Validate Project',
          description: 'Run health checks.',
          category: 'health',
          slashCommand: '/harness:validate',
        })
      }
    >
      select skill
    </button>
  ),
}));

vi.mock('../../../../src/client/components/chat/BriefingPanel', () => ({
  BriefingPanel: ({
    skill,
    onExecute,
    onCancel,
  }: {
    skill: { id: string };
    onExecute: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="briefing-panel" data-skill={skill.id}>
      <button data-testid="briefing-execute" onClick={onExecute}>
        execute
      </button>
      <button data-testid="briefing-cancel" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

// Network + context-derivation seams: fully mocked so nothing touches the wire.
vi.mock('../../../../src/client/utils/chat-stream', () => ({
  streamChat: vi.fn(async () => {}),
  applyChunk: vi.fn(),
}));

vi.mock('../../../../src/client/hooks/useChatContext', () => ({
  useChatContext: () => ({ data: {}, isLoading: false, error: null }),
}));

const SYSTEM_PROMPT = 'SYSTEM_PROMPT_STUB';
vi.mock('../../../../src/client/utils/context-to-prompt', () => ({
  generateSystemPrompt: vi.fn(() => SYSTEM_PROMPT),
}));

const SESSION_ID = 'sess-1';
const THREAD_ID = `chat:${SESSION_ID}`;

function makeChatThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: THREAD_ID,
    type: 'chat',
    title: 'New Chat',
    status: 'active',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    avatar: 'user',
    unread: false,
    meta: { sessionId: SESSION_ID, command: null } as ChatMeta,
    ...overrides,
  };
}

function assistantMessageWithBlocks(blocks: AssistantMessage['blocks']): AssistantMessage {
  return { role: 'assistant', blocks };
}

function resetStore(): void {
  useThreadStore.setState({
    threads: new Map(),
    messages: new Map(),
    panelState: new Map(),
    activeThreadId: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  // Default fetch: cold-mount session GET 404s (new thread), everything else ok.
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/sessions/') && method === 'GET') {
      return Promise.resolve({ ok: false, json: async () => null } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatThreadView view routing', () => {
  it('renders the command palette for an empty thread with no command or skill', () => {
    render(<ChatThreadView thread={makeChatThread()} />);

    expect(screen.getByTestId('palette-select')).toBeDefined();
    expect(screen.queryByTestId('message-stream')).toBeNull();
    expect(screen.getByPlaceholderText('Type a message or select a skill below...')).toBeDefined();
  });

  it('renders the message stream once the thread has messages', () => {
    const thread = makeChatThread();
    useThreadStore.getState().setMessages(thread.id, [{ role: 'user', content: 'hi' }]);

    render(<ChatThreadView thread={thread} />);

    const stream = screen.getByTestId('message-stream');
    expect(stream.getAttribute('data-count')).toBe('1');
    expect(screen.queryByTestId('palette-select')).toBeNull();
    expect(screen.getByPlaceholderText('Type a message...')).toBeDefined();
  });

  it('routes to the briefing panel after selecting a skill and titles the thread from it', async () => {
    const thread = makeChatThread();
    // updateThread is a no-op for threads absent from the store, so seed it
    // before asserting the skill-derived rename lands.
    useThreadStore.setState((s) => ({ threads: new Map(s.threads).set(thread.id, thread) }));
    render(<ChatThreadView thread={thread} />);

    fireEvent.click(screen.getByTestId('palette-select'));

    const briefing = await screen.findByTestId('briefing-panel');
    expect(briefing.getAttribute('data-skill')).toBe(PALETTE_SKILL_ID);
    // Header shows the resolved skill name.
    expect(screen.getByText(PALETTE_SKILL_NAME)).toBeDefined();
    // handleSkillSelect renames an empty thread from the skill id's last segment.
    expect(useThreadStore.getState().threads.get(thread.id)?.title).toBe('validate');
  });

  it('cancelling the briefing returns to the command palette', async () => {
    render(<ChatThreadView thread={makeChatThread()} />);

    fireEvent.click(screen.getByTestId('palette-select'));
    await screen.findByTestId('briefing-panel');

    fireEvent.click(screen.getByTestId('briefing-cancel'));

    expect(await screen.findByTestId('palette-select')).toBeDefined();
    expect(screen.queryByTestId('briefing-panel')).toBeNull();
  });
});

describe('ChatThreadView send + streaming', () => {
  it('appends user/assistant messages, persists the session, and starts a stream on send', async () => {
    const thread = makeChatThread();
    render(<ChatThreadView thread={thread} />);

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'hello world' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
    });

    // Two messages land in the store: the user turn and an empty assistant turn.
    const stored = useThreadStore.getState().messages.get(thread.id) ?? [];
    expect(stored).toHaveLength(2);
    expect((stored[0] as UserMessage).content).toBe('hello world');
    expect(stored[1]?.role).toBe('assistant');

    // The session is persisted via a POST to /api/sessions.
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sessions',
      expect.objectContaining({ method: 'POST' })
    );

    // The stream is kicked off with the trimmed prompt.
    expect(vi.mocked(streamChat)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamChat).mock.calls[0]?.[0]).toBe('hello world');
  });

  it('does not send when the input is empty (whitespace only)', async () => {
    const thread = makeChatThread();
    render(<ChatThreadView thread={thread} />);

    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: '   ' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
    });

    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
    expect(useThreadStore.getState().messages.get(thread.id) ?? []).toHaveLength(0);
  });

  it('executing a skill from the briefing streams the slash command with a generated system prompt', async () => {
    const thread = makeChatThread();
    render(<ChatThreadView thread={thread} />);

    fireEvent.click(screen.getByTestId('palette-select'));
    await screen.findByTestId('briefing-panel');

    await act(async () => {
      fireEvent.click(screen.getByTestId('briefing-execute'));
    });

    expect(vi.mocked(generateSystemPrompt)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamChat)).toHaveBeenCalledTimes(1);
    const [prompt, system] = vi.mocked(streamChat).mock.calls[0] ?? [];
    expect(prompt).toBe(PALETTE_SLASH);
    expect(system).toBe(SYSTEM_PROMPT);
  });

  it('a chat-action-send window event triggers a send with its detail', async () => {
    const thread = makeChatThread();
    useThreadStore.getState().setMessages(thread.id, [{ role: 'user', content: 'prior' }]);
    render(<ChatThreadView thread={thread} />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('chat-action-send', { detail: 'approve all' }));
    });

    expect(vi.mocked(streamChat)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamChat).mock.calls[0]?.[0]).toBe('approve all');
  });
});

describe('ChatThreadView effects', () => {
  it('extracts todos from assistant task blocks and pushes them to the panel state', async () => {
    const thread = makeChatThread();
    const todoBlock = {
      kind: 'tool_use' as const,
      tool: 'TodoWrite',
      args: JSON.stringify({
        todos: [{ id: 't1', content: 'ship the thing', status: 'pending' }],
      }),
    };
    useThreadStore.getState().setMessages(thread.id, [assistantMessageWithBlocks([todoBlock])]);

    render(<ChatThreadView thread={thread} />);

    await waitFor(() => {
      const panel = useThreadStore.getState().panelState.get(thread.id);
      expect(panel?.todos).toHaveLength(1);
    });
    expect(useThreadStore.getState().panelState.get(thread.id)?.todos[0]?.text).toBe(
      'ship the thing'
    );
  });

  it('does not touch panel state when there are no todo-bearing blocks', async () => {
    const thread = makeChatThread();
    useThreadStore
      .getState()
      .setMessages(thread.id, [
        assistantMessageWithBlocks([{ kind: 'text', text: 'just prose, no tasks' }]),
      ]);

    render(<ChatThreadView thread={thread} />);

    // Give any effect a chance to run, then assert nothing was written.
    await act(async () => {
      await Promise.resolve();
    });
    expect(useThreadStore.getState().panelState.get(thread.id)).toBeUndefined();
  });

  it('hydrates messages from the server session on a cold mount', async () => {
    const thread = makeChatThread();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/sessions/${SESSION_ID}`) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sessionId: SESSION_ID,
            messages: [{ role: 'user', content: 'restored from disk' }],
            orchestratorSessionId: 'orch-42',
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }) as unknown as typeof fetch;

    render(<ChatThreadView thread={thread} />);

    await waitFor(() => {
      expect(useThreadStore.getState().messages.get(thread.id)).toHaveLength(1);
    });
    expect((useThreadStore.getState().messages.get(thread.id)?.[0] as UserMessage).content).toBe(
      'restored from disk'
    );
  });
});
