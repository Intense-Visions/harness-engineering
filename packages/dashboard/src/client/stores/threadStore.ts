import { create } from 'zustand';
import type {
  Thread,
  ThreadType,
  ThreadMeta,
  ThreadAvatar,
  ThreadStatus,
  ChatMeta,
  AttentionMeta,
  AnalysisMeta,
  AgentMeta,
} from '../types/thread';
import type { ChatMessage } from '../types/chat';
import type { PanelState } from '../components/layout/ContextPanel';

const LAST_THREAD_KEY = 'harness-last-thread-id';

/** Number of async sources that must call markSourceHydrated() before the store is considered ready. */
let _hydrationPending = 3; // agents + attention + chat sessions

function readLastThreadId(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_THREAD_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistLastThreadId(id: string | null): void {
  try {
    if (id) {
      globalThis.localStorage?.setItem(LAST_THREAD_KEY, id);
    } else {
      globalThis.localStorage?.removeItem(LAST_THREAD_KEY);
    }
  } catch {
    // localStorage unavailable (SSR, tests, etc.)
  }
}

function defaultAvatar(type: ThreadType): ThreadAvatar {
  switch (type) {
    case 'chat':
      return 'user';
    case 'attention':
      return 'alert';
    case 'agent':
      return 'organism';
    case 'analysis':
    case 'system':
      return 'system';
  }
}

function defaultStatus(type: ThreadType): ThreadStatus {
  switch (type) {
    case 'attention':
      return 'pending';
    default:
      return 'active';
  }
}

/** Derive a deterministic thread ID from the type and meta so URLs survive page reloads. */
function deriveThreadId(type: ThreadType, meta: ThreadMeta): string {
  switch (type) {
    case 'agent':
      return `agent:${(meta as AgentMeta).issueId}`;
    case 'attention':
      return `attn:${(meta as AttentionMeta).interactionId}`;
    case 'chat':
      return `chat:${(meta as ChatMeta).sessionId}`;
    default:
      return crypto.randomUUID();
  }
}

function defaultTitle(type: ThreadType, meta: ThreadMeta): string {
  switch (type) {
    case 'chat':
      return (meta as ChatMeta).command
        ? (meta as ChatMeta).command!.split(':').pop() || 'New Chat'
        : 'New Chat';
    case 'attention':
      return `Attention: ${(meta as AttentionMeta).issueId}`;
    case 'analysis':
      return (meta as AnalysisMeta).analysisTitle;
    case 'agent':
      return (meta as AgentMeta).issueTitle || (meta as AgentMeta).identifier;
    case 'system':
      return 'System';
    default:
      return 'Thread';
  }
}

interface SidebarSections {
  attention: Thread[];
  active: Thread[];
  recent: Thread[];
  system: Thread[];
}

function deriveSidebarSections(threads: Map<string, Thread>): SidebarSections {
  const attention: Thread[] = [];
  const active: Thread[] = [];
  const recent: Thread[] = [];
  const system: Thread[] = [];

  for (const thread of threads.values()) {
    if (thread.type === 'system') {
      system.push(thread);
      continue;
    }
    if (thread.type === 'attention' && thread.status === 'pending') {
      attention.push(thread);
      continue;
    }
    if (thread.status === 'completed' || thread.status === 'dismissed') {
      recent.push(thread);
      continue;
    }
    active.push(thread);
  }

  attention.sort((a, b) => b.createdAt - a.createdAt);
  active.sort((a, b) => b.updatedAt - a.updatedAt);
  recent.sort((a, b) => b.updatedAt - a.updatedAt);

  return { attention, active, recent, system };
}

export interface ThreadStore {
  threads: Map<string, Thread>;
  activeThreadId: string | null;
  lastThreadId: string | null;
  /** True once all async hydration sources (agents, attention) have completed their initial fetch. */
  hydrated: boolean;

  // Per-thread messages (owned by store, not component state)
  messages: Map<string, ChatMessage[]>;
  // Per-thread panel state (todos, artifacts, status, context sources)
  panelState: Map<string, PanelState>;

  createThread(type: ThreadType, meta: ThreadMeta): Thread;
  closeThread(id: string): void;
  claimThread(id: string): void;
  dismissThread(id: string): void;
  setActiveThread(id: string | null): void;
  updateThread(id: string, patch: Partial<Thread>): void;
  /** Called by each sync hook when its initial fetch completes (success or failure). */
  markSourceHydrated(): void;

  // Message management
  setMessages(threadId: string, messages: ChatMessage[]): void;
  appendMessage(threadId: string, message: ChatMessage): void;
  updateLastMessage(threadId: string, updater: (msg: ChatMessage) => ChatMessage): void;

  // Panel state management
  updatePanelState(threadId: string, patch: Partial<PanelState>): void;
}

/** Derive sidebar sections from the current thread map. */
export function selectSidebarSections(state: ThreadStore): SidebarSections {
  return deriveSidebarSections(state.threads);
}

/**
 * Return an existing draft chat thread (no command, zero messages) if one is
 * already in the store; otherwise create a fresh one. Used by the "New Chat"
 * button so navigating away and clicking New Chat to come back doesn't strand
 * the user on a brand-new thread when an empty draft is already available.
 */
export function getOrCreateDraftChatThread(): Thread {
  const state = useThreadStore.getState();
  for (const thread of state.threads.values()) {
    if (thread.type !== 'chat') continue;
    if ((thread.meta as ChatMeta).command) continue;
    const msgs = state.messages.get(thread.id);
    if (!msgs || msgs.length === 0) return thread;
  }
  return state.createThread('chat', { sessionId: crypto.randomUUID(), command: null });
}

export const useThreadStore = create<ThreadStore>((set, get) => ({
  threads: new Map(),
  activeThreadId: null,
  lastThreadId: readLastThreadId(),
  hydrated: false,
  messages: new Map(),
  panelState: new Map(),

  createThread(type: ThreadType, meta: ThreadMeta): Thread {
    const id = deriveThreadId(type, meta);
    const existing = get().threads.get(id);
    if (existing) return existing;

    const now = Date.now();
    const thread: Thread = {
      id,
      type,
      title: defaultTitle(type, meta),
      status: defaultStatus(type),
      createdAt: now,
      updatedAt: now,
      avatar: defaultAvatar(type),
      unread: type === 'attention',
      meta,
    };
    set((state) => {
      const threads = new Map(state.threads);
      threads.set(thread.id, thread);
      return { threads };
    });
    return thread;
  },

  closeThread(id: string): void {
    const thread = get().threads.get(id);
    if (thread?.type === 'chat') {
      const sessionId = (thread.meta as ChatMeta).sessionId;
      // Fire-and-forget: without server-side delete, useChatSessionsSync would
      // re-create this thread from disk on the next mount.
      void fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    }
    set((state) => {
      const threads = new Map(state.threads);
      threads.delete(id);
      const messages = new Map(state.messages);
      messages.delete(id);
      const panelState = new Map(state.panelState);
      panelState.delete(id);
      const activeThreadId = state.activeThreadId === id ? null : state.activeThreadId;
      return { threads, messages, panelState, activeThreadId };
    });
  },

  claimThread(id: string): void {
    set((state) => {
      const thread = state.threads.get(id);
      if (!thread) return state;
      const updated = {
        ...thread,
        status: 'active' as const,
        unread: false,
        updatedAt: Date.now(),
      };
      const threads = new Map(state.threads);
      threads.set(id, updated);
      return { threads };
    });
  },

  dismissThread(id: string): void {
    set((state) => {
      const thread = state.threads.get(id);
      if (!thread) return state;
      const updated = {
        ...thread,
        status: 'dismissed' as const,
        unread: false,
        updatedAt: Date.now(),
      };
      const threads = new Map(state.threads);
      threads.set(id, updated);
      return { threads };
    });
  },

  setActiveThread(id: string | null): void {
    set({ activeThreadId: id });
    if (id) {
      persistLastThreadId(id);
      set({ lastThreadId: id });
    }
  },

  updateThread(id: string, patch: Partial<Thread>): void {
    set((state) => {
      const thread = state.threads.get(id);
      if (!thread) return state;
      const updated = { ...thread, ...patch, updatedAt: Date.now() };
      const threads = new Map(state.threads);
      threads.set(id, updated);
      return { threads };
    });
  },

  markSourceHydrated(): void {
    _hydrationPending--;
    if (_hydrationPending <= 0) {
      set({ hydrated: true });
    }
  },

  setMessages(threadId: string, msgs: ChatMessage[]): void {
    set((state) => {
      const messages = new Map(state.messages);
      messages.set(threadId, msgs);
      return { messages };
    });
  },

  appendMessage(threadId: string, message: ChatMessage): void {
    set((state) => {
      const messages = new Map(state.messages);
      const existing = messages.get(threadId) ?? [];
      messages.set(threadId, [...existing, message]);
      return { messages };
    });
  },

  updateLastMessage(threadId: string, updater: (msg: ChatMessage) => ChatMessage): void {
    set((state) => {
      const messages = new Map(state.messages);
      const existing = messages.get(threadId);
      if (!existing || existing.length === 0) return state;
      const updated = [...existing];
      updated[updated.length - 1] = updater(updated[updated.length - 1]!);
      messages.set(threadId, updated);
      return { messages };
    });
  },

  updatePanelState(threadId: string, patch: Partial<PanelState>): void {
    set((state) => {
      const panelState = new Map(state.panelState);
      const existing = panelState.get(threadId) ?? {
        todos: [],
        phase: null,
        skill: null,
        startedAt: null,
        artifacts: [],
        contextSources: [],
      };
      panelState.set(threadId, { ...existing, ...patch });
      return { panelState };
    });
  },
}));
