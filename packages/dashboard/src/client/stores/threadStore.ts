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
      return `Agent: ${(meta as AgentMeta).identifier}`;
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

export const useThreadStore = create<ThreadStore>((set, _get) => ({
  threads: new Map(),
  activeThreadId: null,
  lastThreadId: readLastThreadId(),
  messages: new Map(),
  panelState: new Map(),

  createThread(type: ThreadType, meta: ThreadMeta): Thread {
    const now = Date.now();
    const thread: Thread = {
      id: crypto.randomUUID(),
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
