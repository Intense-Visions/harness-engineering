import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

import { AttentionThreadView } from '../../../../src/client/components/threads/AttentionThreadView';
import { useThreadStore } from '../../../../src/client/stores/threadStore';
import { streamChat } from '../../../../src/client/utils/chat-stream';
import type { Thread, AttentionMeta } from '../../../../src/client/types/thread';
import type { PendingInteraction } from '../../../../src/client/types/orchestrator';
import type { ChatMessage } from '../../../../src/client/types/chat';

// ── framer-motion drives an infinite loading animation; render a plain div so
//    the placeholder is deterministic and no RAF loop leaks between tests.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, className }: { children?: React.ReactNode; className?: string }) => (
          <div className={className}>{children}</div>
        ),
    }
  ),
}));

// ── Stub the heavy leaf components so the test targets AttentionThreadView's
//    own orchestration (fetch → claim/dismiss → send/stream), not their guts.
vi.mock('../../../../src/client/components/cards/BriefingCard', () => ({
  BriefingCard: ({
    interaction,
    collapsed,
    onClaim,
    onDismiss,
  }: {
    interaction: { context: { issueTitle: string } };
    collapsed: boolean;
    onClaim: () => void;
    onDismiss: () => void;
  }) => (
    <div
      data-testid="briefing-card"
      data-collapsed={String(collapsed)}
      data-issue={interaction.context.issueTitle}
    >
      <button data-testid="briefing-claim" onClick={onClaim}>
        claim
      </button>
      <button data-testid="briefing-dismiss" onClick={onDismiss}>
        dismiss
      </button>
    </div>
  ),
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

// Network/streaming seam: fully mocked so nothing touches the wire.
vi.mock('../../../../src/client/utils/chat-stream', () => ({
  streamChat: vi.fn(async () => {}),
  applyChunk: vi.fn(),
}));

const INTERACTION_ID = 'int-1';
const ISSUE_ID = 'ISSUE-1';
const THREAD_ID = `attn:${INTERACTION_ID}`;
const ISSUE_TITLE = 'Fix the flaky widget';
const REASONS = ['ambiguous spec', 'high blast radius'];
// Mirrors the literal in AttentionThreadView's auto-start effect.
const BRAINSTORM_PROMPT =
  'Analyze this escalated issue and help me brainstorm an implementation approach.';

function makeInteraction(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: INTERACTION_ID,
    issueId: ISSUE_ID,
    type: 'needs-human',
    reasons: REASONS,
    context: {
      issueTitle: ISSUE_TITLE,
      issueDescription: 'The widget flakes under load.',
      specPath: 'docs/specs/widget.md',
      planPath: null,
      relatedFiles: ['src/widget.ts', 'src/widget.test.ts'],
    },
    createdAt: '2026-07-20T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

function makeAttentionThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: THREAD_ID,
    type: 'attention',
    title: `Attention: ${ISSUE_ID}`,
    status: 'pending',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    avatar: 'alert',
    unread: true,
    meta: {
      interactionId: INTERACTION_ID,
      issueId: ISSUE_ID,
      reasons: REASONS,
      context: null,
    } as AttentionMeta,
    ...overrides,
  };
}

function resetStore(): void {
  useThreadStore.setState({
    threads: new Map(),
    messages: new Map(),
    panelState: new Map(),
    activeThreadId: null,
  });
}

function seedThread(thread: Thread, messages: ChatMessage[] = []): void {
  useThreadStore.setState((s) => {
    const threads = new Map(s.threads);
    threads.set(thread.id, thread);
    const msgs = new Map(s.messages);
    if (messages.length > 0) msgs.set(thread.id, messages);
    return { threads, messages: msgs };
  });
}

// The list served by GET /api/interactions; per-test mutable.
let interactions: PendingInteraction[];

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  interactions = [makeInteraction()];
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/interactions' && method === 'GET') {
      return Promise.resolve({ ok: true, json: async () => interactions } as Response);
    }
    // PATCH /api/interactions/:id and anything else.
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function patchCalls(): Array<[string, RequestInit]> {
  return vi
    .mocked(global.fetch)
    .mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH'
    ) as Array<[string, RequestInit]>;
}

describe('AttentionThreadView interaction loading', () => {
  it('shows a loading placeholder and never streams while the interaction is unresolved', async () => {
    // Interaction list has no entry matching this thread's interactionId.
    interactions = [];
    const thread = makeAttentionThread();
    seedThread(thread);

    await act(async () => {
      render(<AttentionThreadView thread={thread} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Loading interaction...')).toBeDefined();
    expect(screen.queryByTestId('briefing-card')).toBeNull();
    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
  });

  it('renders the briefing card and retitles an "Attention:"-prefixed thread from the issue title', async () => {
    const thread = makeAttentionThread();
    seedThread(thread);

    render(<AttentionThreadView thread={thread} />);

    const card = await screen.findByTestId('briefing-card');
    expect(card.getAttribute('data-issue')).toBe(ISSUE_TITLE);

    await waitFor(() => {
      expect(useThreadStore.getState().threads.get(thread.id)?.title).toBe(ISSUE_TITLE);
    });
  });
});

describe('AttentionThreadView claim / dismiss', () => {
  it('claiming PATCHes the interaction to "claimed", marks the thread active, and reveals the chat input', async () => {
    const thread = makeAttentionThread({ status: 'pending' });
    seedThread(thread);

    render(<AttentionThreadView thread={thread} />);
    await screen.findByTestId('briefing-card');

    await act(async () => {
      fireEvent.click(screen.getByTestId('briefing-claim'));
      await Promise.resolve();
    });

    // Store transitions to active via claimThread.
    expect(useThreadStore.getState().threads.get(thread.id)?.status).toBe('active');

    // Server is PATCHed to the claimed status.
    const claimPatch = patchCalls().find(([url]) => url === `/api/interactions/${INTERACTION_ID}`);
    expect(claimPatch).toBeDefined();
    expect(JSON.parse(String(claimPatch?.[1].body))).toEqual({ status: 'claimed' });

    // Chat input becomes available once claimed.
    expect(await screen.findByTestId('chat-input')).toBeDefined();
  });

  it('dismissing PATCHes the interaction to "resolved", marks the thread dismissed, and keeps the input hidden', async () => {
    const thread = makeAttentionThread({ status: 'pending' });
    seedThread(thread);

    render(<AttentionThreadView thread={thread} />);
    await screen.findByTestId('briefing-card');

    await act(async () => {
      fireEvent.click(screen.getByTestId('briefing-dismiss'));
      await Promise.resolve();
    });

    expect(useThreadStore.getState().threads.get(thread.id)?.status).toBe('dismissed');

    const dismissPatch = patchCalls().find(
      ([url]) => url === `/api/interactions/${INTERACTION_ID}`
    );
    expect(dismissPatch).toBeDefined();
    expect(JSON.parse(String(dismissPatch?.[1].body))).toEqual({ status: 'resolved' });

    // Not claimed → no chat input, and no stream kicked off by dismissal.
    expect(screen.queryByTestId('chat-input')).toBeNull();
    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
  });
});

describe('AttentionThreadView send + streaming', () => {
  it('auto-starts a brainstorm stream with the interaction-derived system prompt on an already-claimed thread', async () => {
    // status 'active' → claimed starts true → auto-start effect fires once loaded.
    const thread = makeAttentionThread({ status: 'active' });
    seedThread(thread);

    render(<AttentionThreadView thread={thread} />);

    await waitFor(() => {
      expect(vi.mocked(streamChat)).toHaveBeenCalledTimes(1);
    });

    const [prompt, systemPrompt] = vi.mocked(streamChat).mock.calls[0] ?? [];
    expect(prompt).toBe(BRAINSTORM_PROMPT);
    // The generated system prompt is built from the fetched interaction.
    expect(systemPrompt).toContain(`## Issue: ${ISSUE_TITLE}`);
    expect(systemPrompt).toContain('## Escalation Reasons');
    expect(systemPrompt).toContain(`- ${REASONS[0]}`);

    // The user turn + empty assistant turn are appended to the store.
    await waitFor(() => {
      expect(useThreadStore.getState().messages.get(thread.id)).toHaveLength(2);
    });
  });

  it('sends the typed prompt on a follow-up turn without rebuilding a system prompt', async () => {
    // Pre-seed a message so the auto-start effect (messages.length === 0) stays dormant.
    const thread = makeAttentionThread({ status: 'active' });
    seedThread(thread, [{ role: 'user', content: 'prior turn' }]);

    render(<AttentionThreadView thread={thread} />);
    const input = await screen.findByTestId('chat-input');

    fireEvent.change(input, { target: { value: 'discuss the escalation' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
      await Promise.resolve();
    });

    expect(vi.mocked(streamChat)).toHaveBeenCalledTimes(1);
    const [prompt, systemPrompt] = vi.mocked(streamChat).mock.calls[0] ?? [];
    expect(prompt).toBe('discuss the escalation');
    // Not a first turn → no system prompt is synthesized.
    expect(systemPrompt).toBeUndefined();

    // Prior turn + new user turn + empty assistant turn.
    await waitFor(() => {
      expect(useThreadStore.getState().messages.get(thread.id)).toHaveLength(3);
    });
  });

  it('does not stream or mutate messages when the chat input is empty', async () => {
    const thread = makeAttentionThread({ status: 'active' });
    seedThread(thread, [{ role: 'user', content: 'prior turn' }]);

    render(<AttentionThreadView thread={thread} />);
    await screen.findByTestId('chat-input');

    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
      await Promise.resolve();
    });

    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
    expect(useThreadStore.getState().messages.get(thread.id)).toHaveLength(1);
  });
});
