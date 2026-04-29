# Plan: Dashboard Reorganization Phase 1 -- Foundation

**Date:** 2026-04-28 | **Spec:** docs/changes/dashboard-reorganization/proposal.md | **Tasks:** 10 | **Time:** ~40 min

## Goal

Deliver the structural shell for the chat-first dashboard: thread types, a zustand store with CRUD and section derivation, a three-column layout (sidebar / center / placeholder right), sidebar with four collapsible sections (hardcoded system entries), type-based thread routing in the center column, an empty state with quick actions, and a new router in `main.tsx` -- all compiling and rendering with placeholder content.

## Observable Truths (Acceptance Criteria)

1. When the dev server starts (`pnpm dev:client`), the three-column layout renders: a ~280px left sidebar, a flex-1 center column, and the AuraBackground with neural noise overlay.
2. The sidebar shows four collapsible sections labeled "Attention", "Active", "Recent", and "System". The System section contains 12 hardcoded entries: Health, Graph, Impact, Decay, Traceability, Orchestrator, Maintenance, Streams, Roadmap, Adoption, Attention, and Analyze.
3. When navigating to `/`, the center column shows an EmptyState component with "New Chat" and "New Analysis" quick-action buttons plus the existing CommandPalette.
4. When navigating to `/s/health`, the center column renders the existing `<Health />` page component at full width. Same for all 12 system pages.
5. When navigating to `/t/:threadId`, the center column shows a placeholder view whose content varies by thread type (chat, attention, analysis, agent).
6. `ThreadStore` CRUD works: `createThread` produces a thread visible in `sidebarSections`, `setActiveThread` updates `activeThreadId`, `closeThread` removes it. `lastThreadId` persists to localStorage.
7. `pnpm --filter @harness-engineering/dashboard typecheck` passes with zero errors.
8. `pnpm --filter @harness-engineering/dashboard test` passes, including new tests for thread types and threadStore.

## Uncertainties

- [ASSUMPTION] `zustand` is not currently a dependency. Task 1 adds it. If the monorepo has a workspace-level constraint on zustand versions, the install command may need adjustment.
- [ASSUMPTION] The vitest config's client project (`tests/client/**/*.test.{ts,tsx}`) will pick up new store tests without configuration changes.
- [DEFERRABLE] Exact sidebar width and resize behavior -- Phase 1 uses a fixed 280px sidebar. Resizable divider is polish work for Phase 8.
- [DEFERRABLE] The right ContextPanel column is not built in Phase 1. The layout reserves no space for it yet -- it will be added in Phase 3.

## File Map

```
CREATE  packages/dashboard/src/client/types/thread.ts
CREATE  packages/dashboard/src/client/stores/threadStore.ts
CREATE  packages/dashboard/src/client/components/layout/ChatLayout.tsx
CREATE  packages/dashboard/src/client/components/layout/ThreadSidebar.tsx
CREATE  packages/dashboard/src/client/components/layout/ThreadView.tsx
CREATE  packages/dashboard/src/client/components/layout/EmptyState.tsx
CREATE  packages/dashboard/src/client/components/sidebar/SidebarSection.tsx
CREATE  packages/dashboard/src/client/components/sidebar/SystemNavItem.tsx
MODIFY  packages/dashboard/src/client/main.tsx                (replace router)
MODIFY  packages/dashboard/package.json                        (add zustand dep)
CREATE  tests/client/types/thread.test.ts
CREATE  tests/client/stores/threadStore.test.ts
```

## Skeleton

1. Install zustand + define Thread types (~2 tasks, ~8 min)
2. ThreadStore with CRUD and section derivation (~2 tasks, ~8 min)
3. Sidebar components: SidebarSection + SystemNavItem + ThreadSidebar (~2 tasks, ~8 min)
4. Layout shell: ChatLayout + ThreadView + EmptyState (~2 tasks, ~8 min)
5. Router replacement in main.tsx and integration smoke test (~2 tasks, ~8 min)

**Estimated total:** 10 tasks, ~40 minutes

## Tasks

### Task 1: Add zustand dependency

**Depends on:** none | **Files:** packages/dashboard/package.json

1. Run from the repo root:
   ```bash
   pnpm --filter @harness-engineering/dashboard add zustand
   ```
2. Verify it appears in `packages/dashboard/package.json` under `dependencies`.
3. Commit: `chore(dashboard): add zustand dependency for thread state management`

---

### Task 2: Define Thread types in `thread.ts`

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/types/thread.ts`, `packages/dashboard/tests/client/types/thread.test.ts`

1. Create the test file `packages/dashboard/tests/client/types/thread.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  Thread,
  ThreadType,
  ThreadAvatar,
  ThreadStatus,
  ChatMeta,
  AttentionMeta,
  AnalysisMeta,
  AgentMeta,
  SystemMeta,
  ThreadMeta,
} from '../../../src/client/types/thread';

describe('Thread types', () => {
  it('Thread with ChatMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-1',
      type: 'chat',
      title: 'New Chat',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'user',
      unread: false,
      meta: { sessionId: 'sess-1', command: null } satisfies ChatMeta,
    };
    expect(thread.type).toBe('chat');
    expect(thread.status).toBe('active');
  });

  it('Thread with AttentionMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-2',
      type: 'attention',
      title: 'Security Issue',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'alert',
      unread: true,
      meta: {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['High complexity'],
        context: null,
      } satisfies AttentionMeta,
    };
    expect(thread.type).toBe('attention');
    expect(thread.avatar).toBe('alert');
  });

  it('Thread with AgentMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-3',
      type: 'agent',
      title: 'Agent Session',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'organism',
      unread: false,
      meta: {
        issueId: 'issue-2',
        identifier: 'feat/thing',
        phase: 'StreamingTurn',
      } satisfies AgentMeta,
    };
    expect(thread.type).toBe('agent');
  });

  it('Thread with AnalysisMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-4',
      type: 'analysis',
      title: 'Analyze Feature X',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'system',
      unread: false,
      meta: {
        analysisTitle: 'Feature X',
        description: 'Evaluate impact',
        labels: ['backend'],
      } satisfies AnalysisMeta,
    };
    expect(thread.type).toBe('analysis');
  });

  it('Thread with SystemMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-5',
      type: 'system',
      title: 'Health',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'system',
      unread: false,
      meta: { page: 'health' } satisfies SystemMeta,
    };
    expect(thread.type).toBe('system');
  });

  it('ThreadType union covers all five types', () => {
    const types: ThreadType[] = ['chat', 'attention', 'analysis', 'agent', 'system'];
    expect(types).toHaveLength(5);
  });

  it('ThreadAvatar union covers all four variants', () => {
    const avatars: ThreadAvatar[] = ['user', 'organism', 'alert', 'system'];
    expect(avatars).toHaveLength(4);
  });

  it('ThreadStatus union covers all four variants', () => {
    const statuses: ThreadStatus[] = ['pending', 'active', 'completed', 'dismissed'];
    expect(statuses).toHaveLength(4);
  });
});
```

2. Run tests -- observe failure (module not found):

   ```bash
   pnpm --filter @harness-engineering/dashboard test -- --project client tests/client/types/thread.test.ts
   ```

3. Create `packages/dashboard/src/client/types/thread.ts`:

```typescript
// Thread types for the chat-first dashboard rewrite.
// See: docs/changes/dashboard-reorganization/proposal.md

import type { InteractionContext } from './orchestrator';

export type ThreadType = 'chat' | 'attention' | 'analysis' | 'agent' | 'system';

export type ThreadStatus = 'pending' | 'active' | 'completed' | 'dismissed';

export type ThreadAvatar = 'user' | 'organism' | 'alert' | 'system';

/** Metadata for a manual chat thread. */
export interface ChatMeta {
  sessionId: string;
  command: string | null;
}

/** Metadata for an attention/escalation thread. */
export interface AttentionMeta {
  interactionId: string;
  issueId: string;
  reasons: string[];
  context: InteractionContext | null;
}

/** Metadata for an analysis thread (SEL/CML/PESL pipeline). */
export interface AnalysisMeta {
  analysisTitle: string;
  description: string;
  labels: string[];
}

/** Metadata for an agent session thread. */
export interface AgentMeta {
  issueId: string;
  identifier: string;
  phase: string;
}

/** Metadata for a system dashboard page (Health, Graph, etc.). */
export interface SystemMeta {
  page: string;
}

/** Union of all thread meta types. */
export type ThreadMeta = ChatMeta | AttentionMeta | AnalysisMeta | AgentMeta | SystemMeta;

/** The universal unit -- every view in the app is a thread or thread-adjacent. */
export interface Thread {
  id: string;
  type: ThreadType;
  title: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  avatar: ThreadAvatar;
  unread: boolean;
  meta: ThreadMeta;
}

/** All known system pages, used for sidebar System section entries. */
export const SYSTEM_PAGES = [
  { page: 'health', label: 'Health', route: '/s/health' },
  { page: 'graph', label: 'Graph', route: '/s/graph' },
  { page: 'impact', label: 'Impact', route: '/s/impact' },
  { page: 'decay', label: 'Decay Trends', route: '/s/decay' },
  { page: 'traceability', label: 'Traceability', route: '/s/traceability' },
  { page: 'orchestrator', label: 'Orchestrator', route: '/s/orchestrator' },
  { page: 'maintenance', label: 'Maintenance', route: '/s/maintenance' },
  { page: 'streams', label: 'Streams', route: '/s/streams' },
  { page: 'roadmap', label: 'Roadmap', route: '/s/roadmap' },
  { page: 'adoption', label: 'Adoption', route: '/s/adoption' },
  { page: 'attention', label: 'Attention', route: '/s/attention' },
  { page: 'analyze', label: 'Analyze', route: '/s/analyze' },
] as const;

export type SystemPage = (typeof SYSTEM_PAGES)[number]['page'];
```

4. Run tests -- observe pass:
   ```bash
   pnpm --filter @harness-engineering/dashboard test -- --project client tests/client/types/thread.test.ts
   ```
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
6. Commit: `feat(dashboard): define Thread, ThreadType, and meta variant types`

---

### Task 3: Create threadStore with CRUD and section derivation (test first)

**Depends on:** Task 2 | **Files:** `packages/dashboard/tests/client/stores/threadStore.test.ts`

1. Create directory if needed:

   ```bash
   mkdir -p packages/dashboard/tests/client/stores
   ```

2. Create `packages/dashboard/tests/client/stores/threadStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useThreadStore } from '../../../src/client/stores/threadStore';

describe('threadStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useThreadStore.setState({
      threads: new Map(),
      activeThreadId: null,
      lastThreadId: null,
    });
  });

  describe('createThread', () => {
    it('creates a chat thread and adds it to the store', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      expect(thread.type).toBe('chat');
      expect(thread.status).toBe('active');
      expect(thread.avatar).toBe('user');
      expect(thread.title).toBe('New Chat');
      expect(useThreadStore.getState().threads.get(thread.id)).toBe(thread);
    });

    it('creates an attention thread with pending status', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['High complexity'],
        context: null,
      });
      expect(thread.type).toBe('attention');
      expect(thread.status).toBe('pending');
      expect(thread.avatar).toBe('alert');
      expect(thread.unread).toBe(true);
    });

    it('creates an agent thread with organism avatar', () => {
      const thread = useThreadStore.getState().createThread('agent', {
        issueId: 'issue-2',
        identifier: 'feat/thing',
        phase: 'StreamingTurn',
      });
      expect(thread.type).toBe('agent');
      expect(thread.avatar).toBe('organism');
    });

    it('creates an analysis thread', () => {
      const thread = useThreadStore.getState().createThread('analysis', {
        analysisTitle: 'Feature X',
        description: 'Evaluate impact',
        labels: ['backend'],
      });
      expect(thread.type).toBe('analysis');
      expect(thread.avatar).toBe('system');
      expect(thread.title).toBe('Feature X');
    });
  });

  describe('setActiveThread', () => {
    it('sets activeThreadId and updates lastThreadId', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.getState().setActiveThread(thread.id);
      const state = useThreadStore.getState();
      expect(state.activeThreadId).toBe(thread.id);
      expect(state.lastThreadId).toBe(thread.id);
    });

    it('sets activeThreadId to null', () => {
      useThreadStore.getState().setActiveThread(null);
      expect(useThreadStore.getState().activeThreadId).toBeNull();
    });
  });

  describe('closeThread', () => {
    it('removes a thread from the store', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.getState().closeThread(thread.id);
      expect(useThreadStore.getState().threads.has(thread.id)).toBe(false);
    });

    it('clears activeThreadId if closing the active thread', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.getState().setActiveThread(thread.id);
      useThreadStore.getState().closeThread(thread.id);
      expect(useThreadStore.getState().activeThreadId).toBeNull();
    });
  });

  describe('claimThread', () => {
    it('transitions attention thread from pending to active', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      expect(thread.status).toBe('pending');
      useThreadStore.getState().claimThread(thread.id);
      const updated = useThreadStore.getState().threads.get(thread.id);
      expect(updated?.status).toBe('active');
      expect(updated?.unread).toBe(false);
    });
  });

  describe('dismissThread', () => {
    it('transitions a thread to dismissed status', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      useThreadStore.getState().dismissThread(thread.id);
      const updated = useThreadStore.getState().threads.get(thread.id);
      expect(updated?.status).toBe('dismissed');
    });
  });

  describe('sidebarSections (derived)', () => {
    it('sorts threads into correct sections', () => {
      const store = useThreadStore.getState();

      // Attention item (pending)
      store.createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });

      // Active chat
      store.createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });

      // Agent (active)
      store.createThread('agent', {
        issueId: 'issue-2',
        identifier: 'feat/x',
        phase: 'Thinking',
      });

      const sections = useThreadStore.getState().sidebarSections;

      expect(sections.attention).toHaveLength(1);
      expect(sections.attention[0].type).toBe('attention');

      // Active section: chat + agent
      expect(sections.active).toHaveLength(2);

      // Recent and system are empty (no completed threads, system threads not added via createThread)
      expect(sections.recent).toHaveLength(0);
    });

    it('moves completed threads to recent', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      // Manually update status to completed
      useThreadStore.setState((state) => {
        const updated = { ...thread, status: 'completed' as const };
        const threads = new Map(state.threads);
        threads.set(thread.id, updated);
        return { threads };
      });

      const sections = useThreadStore.getState().sidebarSections;
      expect(sections.recent).toHaveLength(1);
      expect(sections.active).toHaveLength(0);
    });

    it('moves dismissed threads to recent', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      useThreadStore.getState().dismissThread(thread.id);

      const sections = useThreadStore.getState().sidebarSections;
      expect(sections.attention).toHaveLength(0);
      expect(sections.recent).toHaveLength(1);
    });
  });
});
```

3. Run tests -- observe failure (module not found):

   ```bash
   pnpm --filter @harness-engineering/dashboard test -- --project client tests/client/stores/threadStore.test.ts
   ```

4. Commit: `test(dashboard): add threadStore unit tests (red phase)`

---

### Task 4: Implement threadStore

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/client/stores/threadStore.ts`

1. Create directory:

   ```bash
   mkdir -p packages/dashboard/src/client/stores
   ```

2. Create `packages/dashboard/src/client/stores/threadStore.ts`:

```typescript
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

const LAST_THREAD_KEY = 'harness-last-thread-id';

function readLastThreadId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_THREAD_KEY);
}

function persistLastThreadId(id: string | null): void {
  if (typeof window === 'undefined') return;
  if (id) {
    localStorage.setItem(LAST_THREAD_KEY, id);
  } else {
    localStorage.removeItem(LAST_THREAD_KEY);
  }
}

/** Derive default avatar from thread type. */
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

/** Derive default initial status from thread type. */
function defaultStatus(type: ThreadType): ThreadStatus {
  switch (type) {
    case 'attention':
      return 'pending';
    default:
      return 'active';
  }
}

/** Derive default title from thread type and meta. */
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
    // active or claimed attention items
    active.push(thread);
  }

  // Sort: attention by createdAt desc, active by updatedAt desc, recent by updatedAt desc
  attention.sort((a, b) => b.createdAt - a.createdAt);
  active.sort((a, b) => b.updatedAt - a.updatedAt);
  recent.sort((a, b) => b.updatedAt - a.updatedAt);

  return { attention, active, recent, system };
}

export interface ThreadStore {
  threads: Map<string, Thread>;
  activeThreadId: string | null;
  lastThreadId: string | null;

  // Thread CRUD
  createThread(type: ThreadType, meta: ThreadMeta): Thread;
  closeThread(id: string): void;
  claimThread(id: string): void;
  dismissThread(id: string): void;
  setActiveThread(id: string | null): void;
  updateThread(id: string, patch: Partial<Thread>): void;

  // Derived sidebar sections
  readonly sidebarSections: SidebarSections;
}

export const useThreadStore = create<ThreadStore>((set, get) => ({
  threads: new Map(),
  activeThreadId: null,
  lastThreadId: readLastThreadId(),

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
      const activeThreadId = state.activeThreadId === id ? null : state.activeThreadId;
      return { threads, activeThreadId };
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

  get sidebarSections(): SidebarSections {
    return deriveSidebarSections(get().threads);
  },
}));
```

3. Run tests -- observe pass:
   ```bash
   pnpm --filter @harness-engineering/dashboard test -- --project client tests/client/stores/threadStore.test.ts
   ```
4. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
5. Commit: `feat(dashboard): implement zustand threadStore with CRUD and sidebar derivation`

---

### Task 5: Create SidebarSection component

**Depends on:** none (pure UI) | **Files:** `packages/dashboard/src/client/components/sidebar/SidebarSection.tsx`

1. Create directory:

   ```bash
   mkdir -p packages/dashboard/src/client/components/sidebar
   ```

2. Create `packages/dashboard/src/client/components/sidebar/SidebarSection.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Props {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function SidebarSection({ label, count, defaultOpen = true, children }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted hover:text-neutral-text transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} />
        </motion.div>
        <span className="flex-1 text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-primary-500/20 px-1.5 py-0.5 text-[8px] font-bold text-primary-500 tabular-nums">
            {count}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

3. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
4. Commit: `feat(dashboard): add collapsible SidebarSection component`

---

### Task 6: Create SystemNavItem component

**Depends on:** none (pure UI) | **Files:** `packages/dashboard/src/client/components/sidebar/SystemNavItem.tsx`

1. Create `packages/dashboard/src/client/components/sidebar/SystemNavItem.tsx`:

```tsx
import { NavLink } from 'react-router';
import {
  Activity,
  Share2,
  Zap,
  TrendingDown,
  Link2,
  Bot,
  Wrench,
  Radio,
  Map,
  BarChart3,
  AlertTriangle,
  FlaskConical,
} from 'lucide-react';

const PAGE_ICONS: Record<string, typeof Activity> = {
  health: Activity,
  graph: Share2,
  impact: Zap,
  decay: TrendingDown,
  traceability: Link2,
  orchestrator: Bot,
  maintenance: Wrench,
  streams: Radio,
  roadmap: Map,
  adoption: BarChart3,
  attention: AlertTriangle,
  analyze: FlaskConical,
};

interface Props {
  page: string;
  label: string;
  route: string;
}

export function SystemNavItem({ page, label, route }: Props) {
  const Icon = PAGE_ICONS[page] ?? Activity;

  return (
    <NavLink
      to={route}
      className={({ isActive }) =>
        [
          'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
          isActive
            ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-neutral-muted hover:text-neutral-text hover:bg-white/[0.04]',
        ].join(' ')
      }
    >
      <Icon size={14} className="flex-shrink-0 opacity-60" />
      <span>{label}</span>
    </NavLink>
  );
}
```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Commit: `feat(dashboard): add SystemNavItem sidebar entry component`

---

### Task 7: Create ThreadSidebar

**Depends on:** Tasks 4, 5, 6 | **Files:** `packages/dashboard/src/client/components/layout/ThreadSidebar.tsx`

1. Create directory:

   ```bash
   mkdir -p packages/dashboard/src/client/components/layout
   ```

2. Create `packages/dashboard/src/client/components/layout/ThreadSidebar.tsx`:

```tsx
import { Plus, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router';
import { SidebarSection } from '../sidebar/SidebarSection';
import { SystemNavItem } from '../sidebar/SystemNavItem';
import { useThreadStore } from '../../stores/threadStore';
import { SYSTEM_PAGES } from '../../types/thread';

export function ThreadSidebar() {
  const navigate = useNavigate();
  const { sidebarSections, createThread, setActiveThread } = useThreadStore();

  const handleNewChat = () => {
    const thread = createThread('chat', { sessionId: crypto.randomUUID(), command: null });
    setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  const handleNewAnalysis = () => {
    const thread = createThread('analysis', {
      analysisTitle: 'New Analysis',
      description: '',
      labels: [],
    });
    setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  return (
    <aside className="flex h-screen w-[280px] flex-shrink-0 flex-col border-r border-white/[0.06] bg-neutral-surface/20 backdrop-blur-xl">
      {/* Header with action buttons */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-3">
        <button
          onClick={handleNewChat}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-500/10 border border-primary-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-500 hover:bg-primary-500/20 transition-colors"
        >
          <Plus size={12} />
          New Chat
        </button>
        <button
          onClick={handleNewAnalysis}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-muted hover:text-neutral-text hover:bg-white/[0.08] transition-colors"
        >
          <FlaskConical size={12} />
          Analyze
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
        {/* Attention section */}
        <SidebarSection label="Attention" count={sidebarSections.attention.length}>
          {sidebarSections.attention.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-neutral-muted/50 italic">No pending items</p>
          ) : (
            sidebarSections.attention.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  setActiveThread(thread.id);
                  navigate(`/t/${thread.id}`);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-neutral-text hover:bg-white/[0.04] transition-colors"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-semantic-warning animate-pulse" />
                <span className="truncate">{thread.title}</span>
              </button>
            ))
          )}
        </SidebarSection>

        {/* Active section */}
        <SidebarSection label="Active" count={sidebarSections.active.length}>
          {sidebarSections.active.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-neutral-muted/50 italic">No active threads</p>
          ) : (
            sidebarSections.active.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  setActiveThread(thread.id);
                  navigate(`/t/${thread.id}`);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-neutral-text hover:bg-white/[0.04] transition-colors"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
                <span className="truncate">{thread.title}</span>
              </button>
            ))
          )}
        </SidebarSection>

        {/* Recent section */}
        <SidebarSection label="Recent" count={sidebarSections.recent.length} defaultOpen={false}>
          {sidebarSections.recent.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-neutral-muted/50 italic">No recent threads</p>
          ) : (
            sidebarSections.recent.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  setActiveThread(thread.id);
                  navigate(`/t/${thread.id}`);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-neutral-muted hover:bg-white/[0.04] transition-colors"
              >
                <span className="truncate">{thread.title}</span>
              </button>
            ))
          )}
        </SidebarSection>

        {/* System section -- hardcoded entries */}
        <SidebarSection label="System">
          <div className="flex flex-col gap-0.5 px-1">
            {SYSTEM_PAGES.map((entry) => (
              <SystemNavItem
                key={entry.page}
                page={entry.page}
                label={entry.label}
                route={entry.route}
              />
            ))}
          </div>
        </SidebarSection>
      </div>
    </aside>
  );
}
```

3. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
4. Commit: `feat(dashboard): add ThreadSidebar with four collapsible sections`

---

### Task 8: Create EmptyState component

**Depends on:** Task 4 (needs threadStore for quick actions) | **Files:** `packages/dashboard/src/client/components/layout/EmptyState.tsx`

1. Create `packages/dashboard/src/client/components/layout/EmptyState.tsx`:

```tsx
import { Plus, FlaskConical, Terminal } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useThreadStore } from '../../stores/threadStore';
import { NeuralOrganism } from '../chat/NeuralOrganism';
import { CommandPalette } from '../chat/CommandPalette';
import type { SkillEntry } from '../../types/skills';

export function EmptyState() {
  const navigate = useNavigate();
  const { createThread, setActiveThread } = useThreadStore();

  const handleNewChat = () => {
    const thread = createThread('chat', { sessionId: crypto.randomUUID(), command: null });
    setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  const handleNewAnalysis = () => {
    const thread = createThread('analysis', {
      analysisTitle: 'New Analysis',
      description: '',
      labels: [],
    });
    setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  const handleSkillSelect = (skill: SkillEntry) => {
    const thread = createThread('chat', {
      sessionId: crypto.randomUUID(),
      command: skill.id,
    });
    setActiveThread(thread.id);
    navigate(`/t/${thread.id}`);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12">
      {/* Hero */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8"
      >
        <NeuralOrganism size={80} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="text-2xl font-black tracking-tight text-white mb-2"
      >
        What would you like to do?
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="text-sm text-neutral-muted mb-8"
      >
        Start a chat, run an analysis, or select a skill below.
      </motion.p>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="flex items-center gap-3 mb-10"
      >
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 rounded-xl bg-primary-500/10 border border-primary-500/20 px-5 py-2.5 text-sm font-bold text-primary-500 hover:bg-primary-500/20 transition-colors"
        >
          <Plus size={16} />
          New Chat
        </button>
        <button
          onClick={handleNewAnalysis}
          className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-5 py-2.5 text-sm font-bold text-neutral-text hover:bg-white/[0.08] transition-colors"
        >
          <FlaskConical size={16} />
          New Analysis
        </button>
      </motion.div>

      {/* Command Palette */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <Terminal size={14} className="text-neutral-muted" />
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-muted">
            Skills & Commands
          </h3>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-white/[0.06] bg-neutral-surface/30 p-4 backdrop-blur-sm">
          <CommandPalette onSelect={handleSkillSelect} />
        </div>
      </motion.div>
    </div>
  );
}
```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Commit: `feat(dashboard): add EmptyState with quick actions and command palette`

---

### Task 9: Create ThreadView and ChatLayout

**Depends on:** Tasks 7, 8 | **Files:** `packages/dashboard/src/client/components/layout/ThreadView.tsx`, `packages/dashboard/src/client/components/layout/ChatLayout.tsx`

1. Create `packages/dashboard/src/client/components/layout/ThreadView.tsx`:

```tsx
import { useParams } from 'react-router';
import { useThreadStore } from '../../stores/threadStore';
import { EmptyState } from './EmptyState';

/** Placeholder view for each thread type (replaced by real views in later phases). */
function ThreadPlaceholder({ type, title }: { type: string; title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 px-8 py-6 backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted mb-2">
          {type} thread
        </p>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-xs text-neutral-muted mt-2">
          Thread view will be implemented in Phase 2-6.
        </p>
      </div>
    </div>
  );
}

/** System page view -- renders existing page components. */
function SystemPageView({ page }: { page: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="rounded-xl border border-white/[0.06] bg-neutral-surface/30 px-8 py-6 backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-muted mb-2">
          System Page
        </p>
        <h3 className="text-lg font-bold text-white capitalize">{page}</h3>
        <p className="text-xs text-neutral-muted mt-2">
          Existing page component will be wired in Phase 7.
        </p>
      </div>
    </div>
  );
}

/** Route: /t/:threadId */
export function ThreadRoute() {
  const { threadId } = useParams<{ threadId: string }>();
  const thread = useThreadStore((s) => (threadId ? s.threads.get(threadId) : undefined));

  if (!thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-neutral-muted">
        <p className="text-sm">Thread not found.</p>
        <p className="text-xs mt-1">It may have been closed or does not exist yet.</p>
      </div>
    );
  }

  return <ThreadPlaceholder type={thread.type} title={thread.title} />;
}

/** Route: /s/:systemPage */
export function SystemRoute() {
  const { systemPage } = useParams<{ systemPage: string }>();
  if (!systemPage) return <EmptyState />;
  return <SystemPageView page={systemPage} />;
}

/** Route: / */
export function HomeRoute() {
  const lastThreadId = useThreadStore((s) => s.lastThreadId);
  const thread = useThreadStore((s) => (lastThreadId ? s.threads.get(lastThreadId) : undefined));

  // If we have a valid last thread, show it. Otherwise show empty state.
  if (thread) {
    return <ThreadPlaceholder type={thread.type} title={thread.title} />;
  }

  return <EmptyState />;
}
```

2. Create `packages/dashboard/src/client/components/layout/ChatLayout.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { AuraBackground } from '../NeonAI/AuraBackground';
import { ThreadSidebar } from './ThreadSidebar';

interface Props {
  children: ReactNode;
}

export function ChatLayout({ children }: Props) {
  const location = useLocation();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isNavigating, setIsNavigating] = useState(false);

  // Trigger navigation progress bar
  useState(() => {
    // handled via effect below
  });

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="h-screen flex text-neutral-text selection:bg-primary-500/30 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      <div className="neural-noise" />
      <AuraBackground mouseX={mousePos.x} mouseY={mousePos.y} />

      {/* Left: Thread Sidebar */}
      <ThreadSidebar />

      {/* Center: Thread View */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-y-auto">
        {/* Navigation progress bar */}
        <AnimatePresence>
          {isNavigating && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'circOut' }}
              className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary-500 via-secondary-400 to-primary-500 z-50 origin-left shadow-[0_0_15px_var(--color-primary-500)]"
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="flex-1 flex flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Right: Context Panel placeholder -- built in Phase 3 */}
    </div>
  );
}
```

3. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
4. Commit: `feat(dashboard): add ChatLayout three-column shell and ThreadView routing components`

---

### Task 10: Replace router in main.tsx and wire system page routes

**Depends on:** Task 9 | **Files:** `packages/dashboard/src/client/main.tsx`

`[checkpoint:human-verify]` -- After this task, the entire old navigation is replaced by the new chat-first layout. Verify the dev server renders the three-column layout with sidebar, system nav entries route to placeholder pages, and "/" shows the EmptyState.

1. Replace `packages/dashboard/src/client/main.tsx` with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ChatLayout } from './components/layout/ChatLayout';
import { HomeRoute, ThreadRoute, SystemRoute } from './components/layout/ThreadView';
import { ProjectPulseProvider } from './hooks/useProjectPulse';
import './index.css';

// Legacy route redirects: map old domain-prefixed routes to system pages
const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  // Intelligence domain
  { from: '/intelligence/health', to: '/s/health' },
  { from: '/intelligence/graph', to: '/s/graph' },
  { from: '/intelligence/impact', to: '/s/impact' },
  { from: '/intelligence/decay', to: '/s/decay' },
  { from: '/intelligence/traceability', to: '/s/traceability' },
  // Agents domain
  { from: '/agents', to: '/s/orchestrator' },
  { from: '/agents/attention', to: '/s/attention' },
  { from: '/agents/analyze', to: '/s/analyze' },
  { from: '/agents/maintenance', to: '/s/maintenance' },
  { from: '/agents/streams', to: '/s/streams' },
  // Roadmap domain
  { from: '/roadmap', to: '/s/roadmap' },
  { from: '/roadmap/adoption', to: '/s/adoption' },
  // Flat legacy routes
  { from: '/health', to: '/s/health' },
  { from: '/graph', to: '/s/graph' },
  { from: '/impact', to: '/s/impact' },
  { from: '/decay-trends', to: '/s/decay' },
  { from: '/traceability', to: '/s/traceability' },
  { from: '/orchestrator', to: '/s/orchestrator' },
  { from: '/orchestrator/attention', to: '/s/attention' },
  { from: '/orchestrator/analyze', to: '/s/analyze' },
  { from: '/orchestrator/chat', to: '/' },
  { from: '/orchestrator/maintenance', to: '/s/maintenance' },
  { from: '/orchestrator/streams', to: '/s/streams' },
  { from: '/adoption', to: '/s/adoption' },
];

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ProjectPulseProvider>
        <BrowserRouter>
          <ChatLayout>
            <Routes>
              {/* Core chat-first routes */}
              <Route path="/" element={<HomeRoute />} />
              <Route path="/t/:threadId" element={<ThreadRoute />} />
              <Route path="/s/:systemPage" element={<SystemRoute />} />

              {/* Legacy redirects */}
              {LEGACY_REDIRECTS.map(({ from, to }) => (
                <Route key={from} path={from} element={<Navigate to={to} replace />} />
              ))}
            </Routes>
          </ChatLayout>
        </BrowserRouter>
      </ProjectPulseProvider>
    </StrictMode>
  );
}
```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Run all tests to verify nothing is broken:
   ```bash
   pnpm --filter @harness-engineering/dashboard test
   ```
4. Start the dev server and verify manually:

   ```bash
   pnpm --filter @harness-engineering/dashboard dev:client
   ```

   - Visit `http://localhost:3700/` -- should show three-column layout with sidebar on left, EmptyState in center with NeuralOrganism, "New Chat" and "New Analysis" buttons, and CommandPalette.
   - Click "Health" in System sidebar section -- should navigate to `/s/health` and show system page placeholder.
   - Click "New Chat" -- should create a thread, navigate to `/t/<uuid>`, and show chat thread placeholder.
   - Sidebar should show the new thread in the "Active" section.

5. Commit: `feat(dashboard): replace router with chat-first three-column layout`

---

## Task Dependency Graph

```
Task 1 (zustand dep)
  └─> Task 2 (thread types)
       └─> Task 3 (store tests)
            └─> Task 4 (store impl)
                 ├─> Task 7 (ThreadSidebar)
                 └─> Task 8 (EmptyState)

Task 5 (SidebarSection) ──┐
Task 6 (SystemNavItem) ───┼─> Task 7 (ThreadSidebar)
                           │
                           └─> Task 9 (ThreadView + ChatLayout)
                                └─> Task 10 (main.tsx router replacement)
```

**Parallel opportunities:** Tasks 5 and 6 can run in parallel with Tasks 3-4. Task 8 can run in parallel with Task 7.

## Changes to Existing Behavior

- [MODIFIED] `main.tsx` -- Complete replacement. Old page-based router with `Layout` wrapper is replaced by `ChatLayout` wrapper with `/t/:threadId`, `/s/:systemPage`, and `/` routes.
- [ADDED] Thread type system (`types/thread.ts`) -- new universal abstraction for all dashboard views.
- [ADDED] Zustand store (`stores/threadStore.ts`) -- replaces the `useChatSessions` + `useChatPanel` hooks for state management. Old hooks remain temporarily for existing `ChatPanel` consumers (removed in Phase 8).
- [ADDED] Three-column `ChatLayout.tsx` -- replaces `Layout.tsx` (old Layout is NOT deleted yet; it becomes unreferenced. Cleanup is Phase 8).
- [ADDED] `ThreadSidebar.tsx` -- replaces `DomainNav.tsx` for navigation. DomainNav is NOT deleted yet.
- [ADDED] `EmptyState.tsx` -- replaces `Overview.tsx` as the home view. Overview is NOT deleted yet.
- [ADDED] Legacy redirect routes for all old URLs pointing to new `/s/:systemPage` paths.

## Notes for Phase 2

Phase 2 (Chat threads) will:

1. Wire real page components into `SystemRoute` (replacing placeholders)
2. Build `ChatThreadView` with `MessageStream` + `ChatInput`
3. Refactor `useChatPanel` into `useChatThread` that writes to `threadStore`
4. Connect SSE streaming to `threadStore.appendMessage`
