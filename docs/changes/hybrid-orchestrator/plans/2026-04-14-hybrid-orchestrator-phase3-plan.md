# Plan: Hybrid Orchestrator Phase 3 -- Web Dashboard Interface

**Date:** 2026-04-14 | **Spec:** docs/changes/hybrid-orchestrator/proposal.md | **Tasks:** 10 | **Time:** ~42 min

## Goal

The web dashboard displays orchestrator state in real-time (agents, tokens, rate limits), surfaces escalated interactions in a Needs Attention panel, provides a Claude Chat Pane for reasoning through complex work with pre-loaded context, sends browser notifications on new escalations, and the TUI is marked as a headless fallback.

## Observable Truths (Acceptance Criteria)

1. When the orchestrator broadcasts a `state_change` event via WebSocket, the Agent Monitor page shall display running agents (identifier, backend, phase, tokens, last message), rate limit status, concurrency, and token totals within 1 second.
2. When the orchestrator broadcasts an `interaction_new` event via WebSocket, the Needs Attention page shall display the new interaction (title, reasons, context) within 5 seconds. (SC6)
3. When the user clicks "Claim" on an interaction, the system shall PATCH the interaction status to `claimed` and open the Claude Chat Pane with the interaction's context pre-loaded in the system prompt. (SC7)
4. When the user clicks "Dismiss" on an interaction, the system shall PATCH the interaction status to `resolved`.
5. While the Claude Chat Pane is open, the system shall stream responses from `POST /api/chat` via SSE and render them incrementally.
6. When the user clicks "Save Plan" in the Claude Chat Pane, the system shall POST the plan to `/api/plans`, resolve the interaction via PATCH, and the orchestrator shall dispatch on the next tick. (SC8)
7. The Agent Monitor page shall show equivalent information to the existing TUI: running agents, rate limits (status, req/min, req/sec, ITPM, OTPM), concurrency (active/max), token usage (input, output, total), efficiency (seconds running). (SC9)
8. When an `interaction_new` WebSocket message arrives and the document is not focused, the system shall request a browser Notification.
9. The TUI at `packages/orchestrator/src/tui/` shall remain functional with a deprecation note in the launcher.
10. `npx vitest run --config packages/dashboard/vitest.config.mts` shall pass with all new client tests.
11. `harness validate` shall pass.

## File Map

```
CREATE  packages/dashboard/src/client/types/orchestrator.ts
CREATE  packages/dashboard/tests/client/types/orchestrator.test.ts
CREATE  packages/dashboard/src/client/hooks/useOrchestratorSocket.ts
CREATE  packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts
CREATE  packages/dashboard/src/client/hooks/useNotifications.ts
CREATE  packages/dashboard/tests/client/hooks/useNotifications.test.ts
CREATE  packages/dashboard/src/client/pages/Orchestrator.tsx
CREATE  packages/dashboard/tests/client/pages/Orchestrator.test.tsx
CREATE  packages/dashboard/src/client/pages/Attention.tsx
CREATE  packages/dashboard/tests/client/pages/Attention.test.tsx
CREATE  packages/dashboard/src/client/pages/Chat.tsx
CREATE  packages/dashboard/tests/client/pages/Chat.test.tsx
MODIFY  packages/dashboard/src/client/App.tsx (add routes)
MODIFY  packages/dashboard/src/client/components/Layout.tsx (add nav items)
MODIFY  packages/dashboard/vite.config.ts (add WebSocket proxy for dev)
MODIFY  packages/orchestrator/src/server/http.ts (fix dashboardDir default)
MODIFY  packages/orchestrator/src/tui/launcher.tsx (add deprecation log)
```

## Skeleton

1. Shared types and build config fixes (~2 tasks, ~7 min)
2. WebSocket hook with reconnect (~1 task, ~4 min)
3. Agent Monitor page with TUI parity (~1 task, ~5 min)
4. Needs Attention page with claim/dismiss (~2 tasks, ~9 min)
5. Claude Chat Pane with SSE streaming and save plan (~2 tasks, ~9 min)
6. Browser notifications hook + TUI deprecation note (~2 tasks, ~8 min)

**Estimated total:** 10 tasks, ~42 minutes

## Tasks

### Task 1: Define orchestrator dashboard types

**Depends on:** none | **Files:** `packages/dashboard/src/client/types/orchestrator.ts`, `packages/dashboard/tests/client/types/orchestrator.test.ts`

These types mirror the orchestrator's snapshot shape and interaction types for use in the React frontend. They are standalone (no import from the orchestrator package -- the dashboard consumes API data).

1. Create `packages/dashboard/tests/client/types/orchestrator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  OrchestratorSnapshot,
  RunningAgent,
  TokenTotals,
  PendingInteraction,
  WebSocketMessage,
  ChatSSEEvent,
} from '../../../src/client/types/orchestrator';

describe('orchestrator dashboard types', () => {
  it('OrchestratorSnapshot has all required fields', () => {
    const snapshot: OrchestratorSnapshot = {
      running: [],
      retryAttempts: [],
      claimed: [],
      tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
      maxConcurrentAgents: 5,
      globalCooldownUntilMs: null,
      recentRequestTimestamps: [],
      recentInputTokens: [],
      recentOutputTokens: [],
      maxRequestsPerMinute: 50,
      maxRequestsPerSecond: 2,
      maxInputTokensPerMinute: 0,
      maxOutputTokensPerMinute: 0,
    };
    expect(snapshot.maxConcurrentAgents).toBe(5);
  });

  it('RunningAgent has session fields', () => {
    const agent: RunningAgent = {
      issueId: 'issue-1',
      identifier: 'test-issue',
      phase: 'StreamingTurn',
      session: {
        backendName: 'local',
        totalTokens: 100,
        turnCount: 3,
        lastMessage: 'Working...',
      },
    };
    expect(agent.session?.totalTokens).toBe(100);
  });

  it('PendingInteraction has context fields', () => {
    const interaction: PendingInteraction = {
      id: 'int-1',
      issueId: 'issue-1',
      type: 'needs-human',
      reasons: ['full-exploration scope'],
      context: {
        issueTitle: 'Add feature X',
        issueDescription: 'Description',
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    expect(interaction.status).toBe('pending');
  });

  it('WebSocketMessage discriminates by type', () => {
    const msg: WebSocketMessage = {
      type: 'state_change',
      data: {
        running: [],
        retryAttempts: [],
        claimed: [],
        tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
        maxConcurrentAgents: 5,
        globalCooldownUntilMs: null,
        recentRequestTimestamps: [],
        recentInputTokens: [],
        recentOutputTokens: [],
        maxRequestsPerMinute: 50,
        maxRequestsPerSecond: 2,
        maxInputTokensPerMinute: 0,
        maxOutputTokensPerMinute: 0,
      },
    };
    expect(msg.type).toBe('state_change');
  });

  it('ChatSSEEvent covers text, usage, error, and done', () => {
    const text: ChatSSEEvent = { type: 'text', text: 'Hello' };
    const usage: ChatSSEEvent = { type: 'usage', inputTokens: 10, outputTokens: 20 };
    const error: ChatSSEEvent = { type: 'error', error: 'fail' };
    expect(text.type).toBe('text');
    expect(usage.type).toBe('usage');
    expect(error.type).toBe('error');
  });
});
```

2. Run test -- observe failure: `cd packages/dashboard && npx vitest run tests/client/types/orchestrator.test.ts`

3. Create `packages/dashboard/src/client/types/orchestrator.ts`:

```typescript
/** Minimal session info for display in the agent monitor. */
export interface AgentSession {
  backendName: string;
  totalTokens: number;
  turnCount: number;
  lastMessage: string | null;
}

/** A running agent entry from the orchestrator snapshot. */
export interface RunningAgent {
  issueId: string;
  identifier: string;
  phase: string;
  session: AgentSession | null;
}

/** Token usage totals. */
export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
}

/** Timestamped token record for rate tracking. */
export interface TimestampedTokens {
  timestamp: number;
  tokens: number;
}

/** Retry queue entry. */
export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

/**
 * Point-in-time orchestrator state snapshot.
 * Shape matches the JSON returned by GET /api/v1/state
 * and broadcast via WebSocket state_change events.
 */
export interface OrchestratorSnapshot {
  running: Array<[string, RunningAgent]>;
  retryAttempts: Array<[string, RetryEntry]>;
  claimed: string[];
  tokenTotals: TokenTotals;
  maxConcurrentAgents: number;
  globalCooldownUntilMs: number | null;
  recentRequestTimestamps: number[];
  recentInputTokens: TimestampedTokens[];
  recentOutputTokens: TimestampedTokens[];
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxInputTokensPerMinute: number;
  maxOutputTokensPerMinute: number;
}

/** Interaction context provided for human review. */
export interface InteractionContext {
  issueTitle: string;
  issueDescription: string | null;
  specPath: string | null;
  planPath: string | null;
  relatedFiles: string[];
}

/** A pending human interaction from the interaction queue. */
export interface PendingInteraction {
  id: string;
  issueId: string;
  type: 'needs-human';
  reasons: string[];
  context: InteractionContext;
  createdAt: string;
  status: 'pending' | 'claimed' | 'resolved';
}

/** Discriminated union for WebSocket messages from the orchestrator server. */
export type WebSocketMessage =
  | { type: 'state_change'; data: OrchestratorSnapshot }
  | { type: 'interaction_new'; data: PendingInteraction }
  | { type: 'agent_event'; data: unknown };

/** SSE event types from the chat proxy endpoint. */
export type ChatSSEEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: string };
```

4. Run test -- observe pass: `cd packages/dashboard && npx vitest run tests/client/types/orchestrator.test.ts`
5. Run: `harness validate`
6. Commit: `feat(dashboard): define orchestrator dashboard types`

---

### Task 2: Fix build config and add orchestrator proxy to Vite

**Depends on:** none | **Files:** `packages/dashboard/vite.config.ts`, `packages/orchestrator/src/server/http.ts`

Two fixes needed:

- The Vite build outputs to `dist/client/` but the orchestrator serves from `dist/`. Fix the orchestrator's default to `dist/client/`.
- Add WebSocket and API proxy to Vite dev server so the dashboard can connect to the orchestrator during development.

1. In `packages/orchestrator/src/server/http.ts`, change line 43:

```typescript
// BEFORE:
this.dashboardDir = deps?.dashboardDir ?? path.resolve('packages', 'dashboard', 'dist');
// AFTER:
this.dashboardDir = deps?.dashboardDir ?? path.resolve('packages', 'dashboard', 'dist', 'client');
```

2. In `packages/dashboard/vite.config.ts`, add proxy entries for the orchestrator API and WebSocket:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env['DASHBOARD_CLIENT_PORT'] ?? 3700),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env['DASHBOARD_API_PORT'] ?? '3701'}`,
        changeOrigin: true,
      },
      '/api/v1': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/api/interactions': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/api/chat': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/api/plans': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `http://localhost:${process.env['ORCHESTRATOR_PORT'] ?? '8080'}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
```

3. Run: `harness validate`
4. Commit: `fix(dashboard): align build output with orchestrator static serving path`

---

### Task 3: Create useOrchestratorSocket hook

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts`, `packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts`

A custom React hook that manages a WebSocket connection to the orchestrator server at `/ws`, parses typed messages, and exposes state/interactions with automatic reconnection.

1. Create `packages/dashboard/tests/client/hooks/useOrchestratorSocket.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOrchestratorSocket } from '../../../src/client/hooks/useOrchestratorSocket';
import type {
  OrchestratorSnapshot,
  PendingInteraction,
} from '../../../src/client/types/orchestrator';

// --- Minimal WebSocket mock ---
class FakeWebSocket {
  static instance: FakeWebSocket | null = null;
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instance = this;
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instance = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeSnapshot(overrides?: Partial<OrchestratorSnapshot>): OrchestratorSnapshot {
  return {
    running: [],
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 100, outputTokens: 200, totalTokens: 300, secondsRunning: 60 },
    maxConcurrentAgents: 5,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    recentInputTokens: [],
    recentOutputTokens: [],
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
    maxInputTokensPerMinute: 80000,
    maxOutputTokensPerMinute: 40000,
    ...overrides,
  };
}

function makeInteraction(): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration'],
    context: {
      issueTitle: 'Complex feature',
      issueDescription: 'Needs human input',
      specPath: null,
      planPath: null,
      relatedFiles: [],
    },
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

describe('useOrchestratorSocket', () => {
  it('starts with null state and empty interactions', () => {
    const { result } = renderHook(() => useOrchestratorSocket());
    expect(result.current.snapshot).toBeNull();
    expect(result.current.interactions).toEqual([]);
    expect(result.current.connected).toBe(false);
  });

  it('updates snapshot on state_change message', async () => {
    const { result } = renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const snap = makeSnapshot();
    act(() => {
      FakeWebSocket.instance?.simulateMessage({ type: 'state_change', data: snap });
    });

    expect(result.current.snapshot).toEqual(snap);
    expect(result.current.connected).toBe(true);
  });

  it('adds interaction on interaction_new message', async () => {
    const { result } = renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const interaction = makeInteraction();
    act(() => {
      FakeWebSocket.instance?.simulateMessage({ type: 'interaction_new', data: interaction });
    });

    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.id).toBe('int-1');
  });

  it('does not duplicate interactions with same id', async () => {
    const { result } = renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const interaction = makeInteraction();
    act(() => {
      FakeWebSocket.instance?.simulateMessage({ type: 'interaction_new', data: interaction });
      FakeWebSocket.instance?.simulateMessage({ type: 'interaction_new', data: interaction });
    });

    expect(result.current.interactions).toHaveLength(1);
  });

  it('attempts reconnect after close', async () => {
    renderHook(() => useOrchestratorSocket());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const first = FakeWebSocket.instance;

    act(() => {
      first?.simulateClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(FakeWebSocket.instance).not.toBe(first);
  });
});
```

2. Run test -- observe failure: `cd packages/dashboard && npx vitest run tests/client/hooks/useOrchestratorSocket.test.ts`

3. Create `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  OrchestratorSnapshot,
  PendingInteraction,
  WebSocketMessage,
} from '../types/orchestrator';

const RECONNECT_DELAY_MS = 3_000;

export interface OrchestratorSocketState {
  snapshot: OrchestratorSnapshot | null;
  interactions: PendingInteraction[];
  connected: boolean;
  /** Manually remove an interaction (after claim/resolve). */
  removeInteraction: (id: string) => void;
  /** Replace interactions list (after fetch from API). */
  setInteractions: (interactions: PendingInteraction[]) => void;
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Manages a WebSocket connection to the orchestrator server.
 * Exposes real-time state snapshots and interaction notifications.
 * Automatically reconnects on disconnect.
 */
export function useOrchestratorSocket(): OrchestratorSocketState {
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null);
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeInteraction = useCallback((id: string) => {
    setInteractions((prev) => prev.filter((i) => i.id !== id));
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let mounted = true;

    function connect() {
      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        if (!mounted) return;
        setConnected(true);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          switch (msg.type) {
            case 'state_change':
              setSnapshot(msg.data);
              break;
            case 'interaction_new':
              setInteractions((prev) => {
                if (prev.some((i) => i.id === msg.data.id)) return prev;
                return [...prev, msg.data];
              });
              break;
            case 'agent_event':
              // Agent events consumed by individual agent detail views (future)
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mounted) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        // onclose fires after onerror, so reconnect is handled there
      };
    }

    connect();

    return () => {
      mounted = false;
      ws?.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  return { snapshot, interactions, connected, removeInteraction, setInteractions };
}
```

4. Run test -- observe pass: `cd packages/dashboard && npx vitest run tests/client/hooks/useOrchestratorSocket.test.ts`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add useOrchestratorSocket hook with reconnect`

---

### Task 4: Build Agent Monitor page

**Depends on:** Task 1, Task 3 | **Files:** `packages/dashboard/src/client/pages/Orchestrator.tsx`, `packages/dashboard/tests/client/pages/Orchestrator.test.tsx`

Displays running agents table, rate limit status, concurrency gauge, and token usage. Uses the `useOrchestratorSocket` hook. Achieves TUI parity (SC9).

1. Create `packages/dashboard/tests/client/pages/Orchestrator.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Orchestrator } from '../../../src/client/pages/Orchestrator';
import type { OrchestratorSnapshot } from '../../../src/client/types/orchestrator';

// Mock the hook
const mockHook = {
  snapshot: null as OrchestratorSnapshot | null,
  interactions: [],
  connected: false,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockHook,
}));

beforeEach(() => {
  mockHook.snapshot = null;
  mockHook.connected = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeSnapshot(overrides?: Partial<OrchestratorSnapshot>): OrchestratorSnapshot {
  return {
    running: [],
    retryAttempts: [],
    claimed: [],
    tokenTotals: { inputTokens: 1000, outputTokens: 2000, totalTokens: 3000, secondsRunning: 120 },
    maxConcurrentAgents: 5,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [Date.now()],
    recentInputTokens: [{ timestamp: Date.now(), tokens: 500 }],
    recentOutputTokens: [{ timestamp: Date.now(), tokens: 300 }],
    maxRequestsPerMinute: 50,
    maxRequestsPerSecond: 2,
    maxInputTokensPerMinute: 80000,
    maxOutputTokensPerMinute: 40000,
    ...overrides,
  };
}

describe('Orchestrator (Agent Monitor) page', () => {
  it('shows connecting message when no snapshot', () => {
    render(<Orchestrator />);
    expect(screen.getByText(/Connecting to orchestrator/i)).toBeDefined();
  });

  it('shows rate limit section when snapshot present', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('Rate Limits')).toBeDefined();
  });

  it('shows token totals', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('Token Usage')).toBeDefined();
    expect(screen.getByText('1,000')).toBeDefined(); // inputTokens formatted
  });

  it('shows concurrency info', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('Concurrency')).toBeDefined();
  });

  it('shows no agents message when running is empty', () => {
    mockHook.snapshot = makeSnapshot();
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText(/No active agents/i)).toBeDefined();
  });

  it('renders agent rows when agents are running', () => {
    mockHook.snapshot = makeSnapshot({
      running: [
        [
          'issue-1',
          {
            issueId: 'issue-1',
            identifier: 'fix-login-bug',
            phase: 'StreamingTurn',
            session: { backendName: 'local', totalTokens: 500, turnCount: 3, lastMessage: 'Working on it...' },
          },
        ],
      ],
    });
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('fix-login-bug')).toBeDefined();
    expect(screen.getByText('local')).toBeDefined();
    expect(screen.getByText('StreamingTurn')).toBeDefined();
  });

  it('shows COOLDOWN status when globalCooldownUntilMs is in the future', () => {
    mockHook.snapshot = makeSnapshot({ globalCooldownUntilMs: Date.now() + 60000 });
    mockHook.connected = true;
    render(<Orchestrator />);
    expect(screen.getByText('COOLDOWN')).toBeDefined();
  });
});
```

2. Run test -- observe failure: `cd packages/dashboard && npx vitest run tests/client/pages/Orchestrator.test.tsx`

3. Create `packages/dashboard/src/client/pages/Orchestrator.tsx`:

```typescript
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import type { OrchestratorSnapshot, RunningAgent } from '../types/orchestrator';

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h2>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function RateLimitsCard({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  const isCooldown =
    snapshot.globalCooldownUntilMs !== null && Date.now() < snapshot.globalCooldownUntilMs;

  const now = Date.now();
  const recentReqCount = snapshot.recentRequestTimestamps.filter((ts) => now - ts < 60000).length;
  const recentInputTokens = snapshot.recentInputTokens
    .filter((t) => now - t.timestamp < 60000)
    .reduce((sum, t) => sum + t.tokens, 0);
  const recentOutputTokens = snapshot.recentOutputTokens
    .filter((t) => now - t.timestamp < 60000)
    .reduce((sum, t) => sum + t.tokens, 0);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeader title="Rate Limits" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className={isCooldown ? 'font-semibold text-red-400' : 'text-emerald-400'}>
            {isCooldown ? 'COOLDOWN' : 'OK'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Req/Min</span>
          <span className="text-blue-400">
            {recentReqCount} / {snapshot.maxRequestsPerMinute}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Req/Sec</span>
          <span className="text-blue-400">{snapshot.maxRequestsPerSecond} max</span>
        </div>
        {snapshot.maxInputTokensPerMinute > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">ITPM</span>
            <span className="text-yellow-400">
              {formatNumber(recentInputTokens)} / {formatNumber(snapshot.maxInputTokensPerMinute)}
            </span>
          </div>
        )}
        {snapshot.maxOutputTokensPerMinute > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">OTPM</span>
            <span className="text-yellow-400">
              {formatNumber(recentOutputTokens)} / {formatNumber(snapshot.maxOutputTokensPerMinute)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConcurrencyCard({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeader title="Concurrency" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Active</span>
          <span className={snapshot.running.length > 0 ? 'text-emerald-400' : 'text-gray-500'}>
            {snapshot.running.length} / {snapshot.maxConcurrentAgents}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Retry Queue</span>
          <span className="text-gray-300">{snapshot.retryAttempts.length}</span>
        </div>
      </div>
    </div>
  );
}

function TokenUsageCard({ snapshot }: { snapshot: OrchestratorSnapshot }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeader title="Token Usage" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Input</span>
          <span className="text-yellow-400">{formatNumber(snapshot.tokenTotals.inputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Output</span>
          <span className="text-yellow-400">{formatNumber(snapshot.tokenTotals.outputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total</span>
          <span className="text-yellow-400">{formatNumber(snapshot.tokenTotals.totalTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Time Running</span>
          <span className="text-blue-400">{Math.round(snapshot.tokenTotals.secondsRunning)}s</span>
        </div>
      </div>
    </div>
  );
}

function AgentsTable({ agents }: { agents: RunningAgent[] }) {
  if (agents.length === 0) {
    return <p className="text-sm italic text-gray-500">No active agents.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-700 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">Identifier</th>
            <th className="px-3 py-2">Backend</th>
            <th className="px-3 py-2">Phase</th>
            <th className="px-3 py-2">Tokens</th>
            <th className="px-3 py-2">Turns</th>
            <th className="px-3 py-2">Last Message</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <tr key={agent.issueId} className="border-b border-gray-800">
              <td className="max-w-[200px] truncate px-3 py-2 text-white">{agent.identifier}</td>
              <td className="px-3 py-2 text-blue-400">{agent.session?.backendName ?? '-'}</td>
              <td className="px-3 py-2 text-cyan-400">{agent.phase}</td>
              <td className="px-3 py-2 text-yellow-400">{agent.session?.totalTokens ?? 0}</td>
              <td className="px-3 py-2 text-gray-300">{agent.session?.turnCount ?? 0}</td>
              <td className="max-w-[300px] truncate px-3 py-2 text-gray-400">
                {agent.session?.lastMessage ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Orchestrator() {
  const { snapshot, connected } = useOrchestratorSocket();

  if (!snapshot) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Agent Monitor</h1>
        <p className="text-sm text-gray-500">
          {connected ? 'Waiting for first state update...' : 'Connecting to orchestrator...'}
        </p>
      </div>
    );
  }

  const agents = snapshot.running.map(([, entry]) => entry);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agent Monitor</h1>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={[
              'inline-block h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-yellow-400',
            ].join(' ')}
          />
          <span className={connected ? 'text-gray-500' : 'text-yellow-400'}>
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <RateLimitsCard snapshot={snapshot} />
        <ConcurrencyCard snapshot={snapshot} />
        <TokenUsageCard snapshot={snapshot} />
      </div>

      <section>
        <SectionHeader title="Active Agents" />
        <AgentsTable agents={agents} />
      </section>
    </div>
  );
}
```

4. Run test -- observe pass: `cd packages/dashboard && npx vitest run tests/client/pages/Orchestrator.test.tsx`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add Agent Monitor page with TUI parity`

---

### Task 5: Build Needs Attention page (list and claim/dismiss)

**Depends on:** Task 1, Task 3 | **Files:** `packages/dashboard/src/client/pages/Attention.tsx`, `packages/dashboard/tests/client/pages/Attention.test.tsx`

Lists pending interactions fetched from `GET /api/interactions` and received via WebSocket. Each interaction card shows title, reasons, and context. "Claim" navigates to the Chat page with the interaction. "Dismiss" resolves the interaction.

1. Create `packages/dashboard/tests/client/pages/Attention.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Attention } from '../../../src/client/pages/Attention';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

// Mock hooks
const mockSocket = {
  snapshot: null,
  interactions: [] as PendingInteraction[],
  connected: true,
  removeInteraction: vi.fn(),
  setInteractions: vi.fn(),
};

vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
  useOrchestratorSocket: () => mockSocket,
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeInteraction(overrides?: Partial<PendingInteraction>): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration scope', 'high complexity signal'],
    context: {
      issueTitle: 'Implement advanced feature',
      issueDescription: 'This feature requires human design decisions.',
      specPath: 'docs/specs/feature.md',
      planPath: null,
      relatedFiles: ['src/core/engine.ts', 'src/api/routes.ts'],
    },
    createdAt: '2026-04-14T10:00:00Z',
    status: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  mockSocket.interactions = [];
  mockSocket.removeInteraction.mockClear();
  mockSocket.setInteractions.mockClear();
  mockFetch.mockReset();
  // Default: GET /api/interactions returns empty
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Attention (Needs Attention) page', () => {
  it('shows empty state when no interactions', async () => {
    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/No interactions require attention/i)).toBeDefined();
    });
  });

  it('displays interaction card with title and reasons', async () => {
    const interaction = makeInteraction();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [interaction],
    });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Implement advanced feature')).toBeDefined();
      expect(screen.getByText(/full-exploration scope/)).toBeDefined();
    });
  });

  it('displays related files', async () => {
    const interaction = makeInteraction();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [interaction],
    });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('src/core/engine.ts')).toBeDefined();
    });
  });

  it('calls PATCH to dismiss an interaction', async () => {
    const interaction = makeInteraction();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [interaction] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Dismiss'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/interactions/int-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
    });
  });

  it('has a Claim button that links to the chat page', async () => {
    const interaction = makeInteraction();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [interaction],
    });

    render(
      <MemoryRouter>
        <Attention />
      </MemoryRouter>
    );

    await waitFor(() => {
      const claimLink = screen.getByText('Claim');
      expect(claimLink.closest('a')?.getAttribute('href')).toBe(
        '/orchestrator/chat?interactionId=int-1'
      );
    });
  });
});
```

2. Run test -- observe failure: `cd packages/dashboard && npx vitest run tests/client/pages/Attention.test.tsx`

3. Create `packages/dashboard/src/client/pages/Attention.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { useOrchestratorSocket } from '../hooks/useOrchestratorSocket';
import type { PendingInteraction } from '../types/orchestrator';

function InteractionCard({
  interaction,
  onDismiss,
}: {
  interaction: PendingInteraction;
  onDismiss: (id: string) => void;
}) {
  const { context, reasons, status, createdAt } = interaction;
  const isPending = status === 'pending';
  const isClaimed = status === 'claimed';

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">{context.issueTitle}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(createdAt).toLocaleString()} · {interaction.issueId}
          </p>
        </div>
        <span
          className={[
            'rounded px-2 py-0.5 text-xs font-medium',
            isPending ? 'bg-yellow-900 text-yellow-300' : '',
            isClaimed ? 'bg-blue-900 text-blue-300' : '',
            status === 'resolved' ? 'bg-gray-700 text-gray-400' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {status}
        </span>
      </div>

      {context.issueDescription && (
        <p className="mb-3 text-sm text-gray-300">{context.issueDescription}</p>
      )}

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">
          Escalation Reasons
        </p>
        <ul className="space-y-1">
          {reasons.map((reason, i) => (
            <li key={i} className="text-sm text-yellow-400">
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {context.relatedFiles.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">
            Related Files
          </p>
          <ul className="space-y-0.5">
            {context.relatedFiles.map((file) => (
              <li key={file} className="font-mono text-xs text-gray-400">
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      {context.specPath && (
        <p className="mb-3 text-xs text-gray-500">
          Spec: <span className="font-mono text-gray-400">{context.specPath}</span>
        </p>
      )}

      {(isPending || isClaimed) && (
        <div className="flex gap-2">
          <Link
            to={`/orchestrator/chat?interactionId=${interaction.id}`}
            className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            Claim
          </Link>
          <button
            onClick={() => onDismiss(interaction.id)}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function Attention() {
  const { interactions: wsInteractions, removeInteraction, setInteractions } =
    useOrchestratorSocket();
  const [loaded, setLoaded] = useState(false);
  const [allInteractions, setAllInteractions] = useState<PendingInteraction[]>([]);

  // Fetch initial interactions from API
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/interactions');
        if (res.ok) {
          const data = (await res.json()) as PendingInteraction[];
          setInteractions(data);
          setAllInteractions(data);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [setInteractions]);

  // Merge WebSocket interactions into local state
  useEffect(() => {
    if (wsInteractions.length > 0) {
      setAllInteractions((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        const newOnes = wsInteractions.filter((i) => !ids.has(i.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
    }
  }, [wsInteractions]);

  const handleDismiss = useCallback(
    async (id: string) => {
      await fetch(`/api/interactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      removeInteraction(id);
      setAllInteractions((prev) => prev.filter((i) => i.id !== id));
    },
    [removeInteraction]
  );

  // Show non-resolved interactions, sorted newest first
  const visible = allInteractions
    .filter((i) => i.status !== 'resolved')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Needs Attention</h1>

      {!loaded && <p className="text-sm text-gray-500">Loading interactions...</p>}

      {loaded && visible.length === 0 && (
        <p className="text-sm text-gray-500">No interactions require attention.</p>
      )}

      <div className="space-y-4">
        {visible.map((interaction) => (
          <InteractionCard
            key={interaction.id}
            interaction={interaction}
            onDismiss={(id) => void handleDismiss(id)}
          />
        ))}
      </div>
    </div>
  );
}
```

4. Run test -- observe pass: `cd packages/dashboard && npx vitest run tests/client/pages/Attention.test.tsx`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add Needs Attention page with claim and dismiss`

---

### Task 6: Build Claude Chat Pane -- message list and SSE streaming

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/pages/Chat.tsx`, `packages/dashboard/tests/client/pages/Chat.test.tsx`

The Chat page reads `interactionId` from the URL query, fetches the interaction details, builds a system prompt from the context, and provides a chat interface that streams Claude responses via SSE. This task covers the chat rendering and streaming. Task 7 adds the Save Plan action.

1. Create `packages/dashboard/tests/client/pages/Chat.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Chat } from '../../../src/client/pages/Chat';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeInteraction(): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'issue-1',
    type: 'needs-human',
    reasons: ['full-exploration scope'],
    context: {
      issueTitle: 'Design new feature',
      issueDescription: 'This needs careful planning.',
      specPath: 'docs/specs/feature.md',
      planPath: null,
      relatedFiles: ['src/core/engine.ts'],
    },
    createdAt: '2026-04-14T10:00:00Z',
    status: 'pending',
  };
}

function renderChat(search = '?interactionId=int-1') {
  return render(
    <MemoryRouter initialEntries={[`/orchestrator/chat${search}`]}>
      <Routes>
        <Route path="/orchestrator/chat" element={<Chat />} />
      </Routes>
    </MemoryRouter>
  );
}

// Helper to make a ReadableStream from SSE data
function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Chat (Claude Chat Pane) page', () => {
  it('shows loading while fetching interaction', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    expect(screen.getByText(/Loading interaction context/i)).toBeDefined();
  });

  it('shows interaction title after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText('Design new feature')).toBeDefined();
    });
  });

  it('has a message input and send button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).toBeDefined();
      expect(screen.getByText('Send')).toBeDefined();
    });
  });

  it('sends message to /api/chat on submit', async () => {
    const interaction = makeInteraction();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [interaction] }) // GET /api/interactions
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) // PATCH claim
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: makeSSEStream([
          'data: {"type":"text","text":"Hello"}\n\n',
          'data: {"type":"usage","inputTokens":10,"outputTokens":5}\n\n',
          'data: [DONE]\n\n',
        ]),
      }); // POST /api/chat

    renderChat();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(input, { target: { value: 'Help me plan this feature' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      // The chat endpoint was called
      const chatCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0] === '/api/chat'
      );
      expect(chatCall).toBeDefined();
    });
  });

  it('shows error state when no interactionId', () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    renderChat('');
    expect(screen.getByText(/No interaction selected/i)).toBeDefined();
  });

  it('shows Save Plan button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [makeInteraction()],
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText('Save Plan')).toBeDefined();
    });
  });
});
```

2. Run test -- observe failure: `cd packages/dashboard && npx vitest run tests/client/pages/Chat.test.tsx`

3. Create `packages/dashboard/src/client/pages/Chat.tsx`:

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import type { PendingInteraction, ChatSSEEvent } from '../types/orchestrator';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(interaction: PendingInteraction): string {
  const { context, reasons } = interaction;
  const parts: string[] = [
    `You are helping a human engineer reason through a complex issue that was escalated from the orchestrator.`,
    ``,
    `## Issue: ${context.issueTitle}`,
  ];

  if (context.issueDescription) {
    parts.push(``, `## Description`, context.issueDescription);
  }

  if (reasons.length > 0) {
    parts.push(``, `## Escalation Reasons`, ...reasons.map((r) => `- ${r}`));
  }

  if (context.specPath) {
    parts.push(``, `## Spec`, `Available at: ${context.specPath}`);
  }

  if (context.relatedFiles.length > 0) {
    parts.push(``, `## Related Files`, ...context.relatedFiles.map((f) => `- ${f}`));
  }

  parts.push(
    ``,
    `## Instructions`,
    `Help the human brainstorm and produce a plan. When the human is satisfied with the plan, they will save it using the "Save Plan" button. The plan should be written in markdown and follow the project's existing plan format in docs/plans/.`
  );

  return parts.join('\n');
}

async function streamChat(
  messages: ChatMessage[],
  system: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal: AbortSignal
): Promise<void> {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system }),
      signal,
    });

    if (!res.ok || !res.body) {
      onError(`Chat request failed: HTTP ${res.status}`);
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
          onDone();
          return;
        }
        try {
          const event = JSON.parse(payload) as ChatSSEEvent;
          if (event.type === 'text') {
            onChunk(event.text);
          } else if (event.type === 'error') {
            onError(event.error);
            return;
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    onDone();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      onError((err as Error).message ?? 'Stream failed');
    }
  }
}

export function Chat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const interactionId = searchParams.get('interactionId');

  const [interaction, setInteraction] = useState<PendingInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch interaction on mount
  useEffect(() => {
    if (!interactionId) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/interactions');
        if (res.ok) {
          const all = (await res.json()) as PendingInteraction[];
          const found = all.find((i) => i.id === interactionId);
          if (found) {
            setInteraction(found);
            // Claim the interaction
            if (found.status === 'pending') {
              await fetch(`/api/interactions/${found.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'claimed' }),
              });
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [interactionId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming || !interaction) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setStreaming(true);

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamChat(
      updatedMessages,
      buildSystemPrompt(interaction),
      (text) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + text };
          }
          return updated;
        });
      },
      () => setStreaming(false),
      (error) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + `\n\n[Error: ${error}]`,
            };
          }
          return updated;
        });
        setStreaming(false);
      },
      controller.signal
    );
  }, [input, streaming, messages, interaction]);

  const handleSavePlan = useCallback(async () => {
    if (!interaction) return;

    // Find the last assistant message as the plan content
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant?.content) return;

    setSavingPlan(true);
    setSaveError(null);

    try {
      const date = new Date().toISOString().slice(0, 10);
      const slug = interaction.issueId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const filename = `${date}-${slug}-plan.md`;

      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: lastAssistant.content }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }

      // Resolve the interaction
      await fetch(`/api/interactions/${interaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      setSaveSuccess(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSavingPlan(false);
    }
  }, [interaction, messages]);

  if (!interactionId) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Claude Chat</h1>
        <p className="text-sm text-gray-500">No interaction selected. Go to Needs Attention to claim one.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Claude Chat</h1>
        <p className="text-sm text-gray-500">Loading interaction context...</p>
      </div>
    );
  }

  if (!interaction) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">Claude Chat</h1>
        <p className="text-sm text-red-400">Interaction not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{interaction.context.issueTitle}</h1>
          <p className="text-xs text-gray-500">{interaction.issueId} · Claude Chat Pane</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleSavePlan()}
            disabled={savingPlan || streaming || messages.length === 0}
            className={[
              'rounded px-3 py-1.5 text-xs font-medium',
              saveSuccess
                ? 'bg-emerald-800 text-emerald-200'
                : 'bg-blue-700 text-white hover:bg-blue-600',
              (savingPlan || streaming) && !saveSuccess
                ? 'cursor-not-allowed opacity-50'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {savingPlan ? 'Saving...' : saveSuccess ? 'Plan Saved' : 'Save Plan'}
          </button>
          <button
            onClick={() => void navigate('/orchestrator/attention')}
            className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      </div>

      {saveError && <p className="mb-2 text-xs text-red-400">{saveError}</p>}

      {/* Context sidebar */}
      <div className="mb-4 rounded border border-gray-800 bg-gray-900 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-gray-500">Context</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
          {interaction.reasons.map((r, i) => (
            <span key={i} className="rounded bg-yellow-900/30 px-2 py-0.5 text-yellow-400">
              {r}
            </span>
          ))}
          {interaction.context.specPath && (
            <span className="font-mono">{interaction.context.specPath}</span>
          )}
          {interaction.context.relatedFiles.map((f) => (
            <span key={f} className="font-mono">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded border border-gray-800 bg-gray-950 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Start a conversation. The context from the escalated issue is pre-loaded.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={[
              'mb-4',
              msg.role === 'user' ? 'text-right' : 'text-left',
            ].join(' ')}
          >
            <span className="mb-1 block text-xs text-gray-500">
              {msg.role === 'user' ? 'You' : 'Claude'}
            </span>
            <div
              className={[
                'inline-block max-w-[80%] rounded-lg px-4 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-blue-900 text-white'
                  : 'bg-gray-800 text-gray-100',
              ].join(' ')}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content || (streaming && i === messages.length - 1 ? '...' : '')}</pre>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type your message..."
          disabled={streaming}
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {streaming ? 'Streaming...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

4. Run test -- observe pass: `cd packages/dashboard && npx vitest run tests/client/pages/Chat.test.tsx`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add Claude Chat Pane with SSE streaming and save plan`

---

### Task 7: Wire routes and update navigation

**Depends on:** Task 4, Task 5, Task 6 | **Files:** `packages/dashboard/src/client/App.tsx`, `packages/dashboard/src/client/components/Layout.tsx`

Add orchestrator routes to the React router and navigation links to the Layout.

1. Modify `packages/dashboard/src/client/App.tsx` to add orchestrator routes:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Roadmap } from './pages/Roadmap';
import { Health } from './pages/Health';
import { Graph } from './pages/Graph';
import { CI } from './pages/CI';
import { Impact } from './pages/Impact';
import { Orchestrator } from './pages/Orchestrator';
import { Attention } from './pages/Attention';
import { Chat } from './pages/Chat';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/health" element={<Health />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/ci" element={<CI />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/orchestrator" element={<Orchestrator />} />
          <Route path="/orchestrator/attention" element={<Attention />} />
          <Route path="/orchestrator/chat" element={<Chat />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
```

2. Modify `packages/dashboard/src/client/components/Layout.tsx` to add orchestrator nav items:

```typescript
const NAV_ITEMS = [
  { to: '/', label: 'Overview' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/health', label: 'Health' },
  { to: '/graph', label: 'Graph' },
  { to: '/ci', label: 'CI' },
  { to: '/impact', label: 'Impact' },
  { to: '/orchestrator', label: 'Agents' },
  { to: '/orchestrator/attention', label: 'Attention' },
] as const;
```

3. Run: `harness validate`
4. Commit: `feat(dashboard): wire orchestrator routes and navigation`

---

### Task 8: Add browser notifications hook

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/client/hooks/useNotifications.ts`, `packages/dashboard/tests/client/hooks/useNotifications.test.ts`

A hook that requests browser notification permission and fires a Notification when a new `interaction_new` arrives while the document is not focused.

1. Create `packages/dashboard/tests/client/hooks/useNotifications.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotifications } from '../../../src/client/hooks/useNotifications';
import type { PendingInteraction } from '../../../src/client/types/orchestrator';

let mockPermission = 'default';
const mockRequestPermission = vi.fn().mockResolvedValue('granted');
const MockNotification = vi.fn();

beforeEach(() => {
  mockPermission = 'default';
  MockNotification.mockClear();
  mockRequestPermission.mockClear().mockResolvedValue('granted');

  Object.defineProperty(MockNotification, 'permission', {
    get: () => mockPermission,
    configurable: true,
  });
  MockNotification.requestPermission = mockRequestPermission;

  vi.stubGlobal('Notification', MockNotification);

  Object.defineProperty(document, 'hidden', {
    value: true,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeInteraction(id: string): PendingInteraction {
  return {
    id,
    issueId: `issue-${id}`,
    type: 'needs-human',
    reasons: ['test reason'],
    context: {
      issueTitle: `Test Issue ${id}`,
      issueDescription: null,
      specPath: null,
      planPath: null,
      relatedFiles: [],
    },
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

describe('useNotifications', () => {
  it('requests permission on mount', () => {
    renderHook(() => useNotifications([]));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('fires notification for new interaction when document is hidden', () => {
    mockPermission = 'granted';
    const interactions = [makeInteraction('1')];
    const { rerender } = renderHook(({ interactions }) => useNotifications(interactions), {
      initialProps: { interactions: [] as PendingInteraction[] },
    });

    rerender({ interactions });

    expect(MockNotification).toHaveBeenCalledWith(
      expect.stringContaining('Needs Attention'),
      expect.objectContaining({ body: expect.stringContaining('Test Issue 1') })
    );
  });

  it('does not fire notification when document is visible', () => {
    mockPermission = 'granted';
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    const { rerender } = renderHook(({ interactions }) => useNotifications(interactions), {
      initialProps: { interactions: [] as PendingInteraction[] },
    });

    rerender({ interactions: [makeInteraction('1')] });

    expect(MockNotification).not.toHaveBeenCalled();
  });

  it('does not fire for already-seen interactions', () => {
    mockPermission = 'granted';
    const interaction = makeInteraction('1');

    const { rerender } = renderHook(({ interactions }) => useNotifications(interactions), {
      initialProps: { interactions: [interaction] },
    });

    // Rerender with same interaction -- should not re-notify
    MockNotification.mockClear();
    rerender({ interactions: [interaction] });

    expect(MockNotification).not.toHaveBeenCalled();
  });
});
```

2. Run test -- observe failure: `cd packages/dashboard && npx vitest run tests/client/hooks/useNotifications.test.ts`

3. Create `packages/dashboard/src/client/hooks/useNotifications.ts`:

```typescript
import { useEffect, useRef } from 'react';
import type { PendingInteraction } from '../types/orchestrator';

/**
 * Requests browser notification permission on mount.
 * Fires a Notification for each new interaction that arrives while the document is hidden.
 */
export function useNotifications(interactions: PendingInteraction[]): void {
  const seenIds = useRef<Set<string>>(new Set());

  // Request permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // Initialize seen set with initial interactions
  useEffect(() => {
    if (seenIds.current.size === 0 && interactions.length > 0) {
      for (const i of interactions) {
        seenIds.current.add(i.id);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire notifications for new interactions
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden) return;

    for (const interaction of interactions) {
      if (seenIds.current.has(interaction.id)) continue;
      seenIds.current.add(interaction.id);

      new Notification('Needs Attention', {
        body: `${interaction.context.issueTitle}\n${interaction.reasons.join(', ')}`,
        tag: interaction.id,
      });
    }
  }, [interactions]);
}
```

4. Run test -- observe pass: `cd packages/dashboard && npx vitest run tests/client/hooks/useNotifications.test.ts`
5. Run: `harness validate`
6. Commit: `feat(dashboard): add browser notifications for new escalations`

---

### Task 9: Integrate notifications into Attention page

**Depends on:** Task 5, Task 8 | **Files:** `packages/dashboard/src/client/pages/Attention.tsx`

Wire the `useNotifications` hook into the Attention page so that notifications fire when new interactions arrive via WebSocket.

1. Modify `packages/dashboard/src/client/pages/Attention.tsx`. Add to imports:

```typescript
import { useNotifications } from '../hooks/useNotifications';
```

2. Inside the `Attention` function body, after the existing hooks, add:

```typescript
// Fire browser notifications for new escalations
useNotifications(allInteractions);
```

3. Run all dashboard client tests: `cd packages/dashboard && npx vitest run tests/client/`
4. Run: `harness validate`
5. Commit: `feat(dashboard): wire browser notifications into Attention page`

---

### Task 10: Add TUI deprecation note

**Depends on:** none | **Files:** `packages/orchestrator/src/tui/launcher.tsx`

Add a deprecation log to the TUI launcher, marking it as a headless/SSH fallback.

1. Modify `packages/orchestrator/src/tui/launcher.tsx`:

```typescript
import { render } from 'ink';
import { Orchestrator } from '../orchestrator';
import { Dashboard } from './app';

/**
 * Launches the Ink TUI for the given Orchestrator instance.
 * Returns a function to wait for the TUI to exit.
 *
 * @deprecated The TUI is maintained as a fallback for headless/SSH environments.
 * The web dashboard (served at port 8080) is the primary monitoring interface.
 */
export function launchTUI(orchestrator: Orchestrator): { waitUntilExit: () => Promise<void> } {
  console.warn(
    '[DEPRECATED] The TUI is a fallback for headless environments. Use the web dashboard at http://localhost:8080 instead.'
  );
  const { waitUntilExit } = render(<Dashboard orchestrator={orchestrator} />);
  return { waitUntilExit };
}
```

2. Run: `harness validate`
3. Commit: `chore(orchestrator): mark TUI as deprecated fallback for headless environments`

---

## Parallel Opportunities

- **Task 1** and **Task 2** and **Task 10** have no dependencies and can run in parallel.
- **Task 3** depends on Task 1 only.
- **Task 4** and **Task 5** and **Task 6** all depend on Task 1 and Task 3, but are independent of each other (can run in parallel once Task 3 is done).
- **Task 7** depends on Tasks 4, 5, 6 (final wiring).
- **Task 8** depends on Task 3.
- **Task 9** depends on Tasks 5 and 8.

## Verification Matrix

| Observable Truth                                        | Task(s)    |
| ------------------------------------------------------- | ---------- |
| OT1: Agent Monitor displays state                       | Task 4     |
| OT2: Needs Attention shows interactions within 5s (SC6) | Task 5     |
| OT3: Claim opens Chat with pre-loaded context (SC7)     | Tasks 5, 6 |
| OT4: Dismiss resolves interaction                       | Task 5     |
| OT5: Chat streams SSE responses                         | Task 6     |
| OT6: Save Plan writes file, resolves interaction (SC8)  | Task 6     |
| OT7: TUI parity (SC9)                                   | Task 4     |
| OT8: Browser notifications on new escalations           | Tasks 8, 9 |
| OT9: TUI remains functional with deprecation note       | Task 10    |
| OT10: Dashboard client tests pass                       | All tasks  |
| OT11: harness validate passes                           | All tasks  |
