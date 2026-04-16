# Plan: Hybrid Orchestrator Phase 2 -- Server + WebSocket Transport

**Date:** 2026-04-14 | **Spec:** docs/changes/hybrid-orchestrator/proposal.md | **Tasks:** 12 | **Time:** ~48 min

## Goal

The orchestrator server broadcasts state, interactions, and agent events in real-time via WebSocket; exposes REST endpoints for interactions CRUD, chat proxy, and plan writing; serves static dashboard files; and watches `docs/plans/` to auto-resolve matching interactions.

## Observable Truths (Acceptance Criteria)

1. When a `state_change` event fires on the Orchestrator, the server shall broadcast a `{"type":"state_change","data":...}` message to all connected WebSocket clients.
2. When a new interaction is pushed to the InteractionQueue, the server shall broadcast a `{"type":"interaction_new","data":...}` message to all connected WebSocket clients.
3. When an `agent_event` fires on the Orchestrator, the server shall broadcast a `{"type":"agent_event","data":...}` message to all connected WebSocket clients.
4. `GET /api/interactions` shall return HTTP 200 with JSON array of all interactions from the InteractionQueue.
5. `PATCH /api/interactions/:id` with `{"status":"claimed"}` or `{"status":"resolved"}` shall update the interaction and return HTTP 200.
6. `GET /api/v1/state` (existing) shall continue to return HTTP 200 with the orchestrator snapshot.
7. `POST /api/chat` shall proxy streaming messages to the Anthropic API and stream Server-Sent Events back to the client.
8. `POST /api/plans` with `{"filename":"...","content":"..."}` shall write the file to `docs/plans/` and return HTTP 201.
9. The server shall serve static files from `packages/dashboard/dist/` at root path when the directory exists, returning `index.html` for non-API, non-file paths (SPA fallback).
10. When a new `.md` file is created in `docs/plans/`, the file watcher shall find any pending interaction whose `issueId` matches the filename prefix and resolve it.
11. All tests pass: `npx vitest run --config packages/orchestrator/vitest.config.mts`
12. `harness validate` passes.

## File Map

```
CREATE  packages/orchestrator/src/server/websocket.ts
CREATE  packages/orchestrator/tests/server/websocket.test.ts
MODIFY  packages/orchestrator/src/server/http.ts
MODIFY  packages/orchestrator/tests/server/http.test.ts
CREATE  packages/orchestrator/src/server/routes/interactions.ts
CREATE  packages/orchestrator/tests/server/routes/interactions.test.ts
CREATE  packages/orchestrator/src/server/routes/chat-proxy.ts
CREATE  packages/orchestrator/tests/server/routes/chat-proxy.test.ts
CREATE  packages/orchestrator/src/server/routes/plans.ts
CREATE  packages/orchestrator/tests/server/routes/plans.test.ts
CREATE  packages/orchestrator/src/server/static.ts
CREATE  packages/orchestrator/tests/server/static.test.ts
CREATE  packages/orchestrator/src/server/plan-watcher.ts
CREATE  packages/orchestrator/tests/server/plan-watcher.test.ts
MODIFY  packages/orchestrator/src/orchestrator.ts (pass interactionQueue to server, hook broadcast)
MODIFY  packages/orchestrator/package.json (add ws + @types/ws)
```

## Skeleton

1. Install `ws` dependency and add types (~1 task, ~3 min)
2. WebSocket broadcaster module (~2 tasks, ~8 min)
3. Extend HTTP server with WebSocket upgrade + event wiring (~2 tasks, ~8 min)
4. REST routes: interactions CRUD (~2 tasks, ~8 min)
5. REST routes: chat proxy with SSE streaming (~1 task, ~5 min)
6. REST routes: plan write endpoint (~1 task, ~4 min)
7. Static file serving + SPA fallback (~1 task, ~4 min)
8. Plan file watcher with auto-resolve (~2 tasks, ~8 min)

**Estimated total:** 12 tasks, ~48 minutes

## Tasks

### Task 1: Install ws dependency

**Depends on:** none | **Files:** packages/orchestrator/package.json

1. Run from repo root:
   ```bash
   cd packages/orchestrator && pnpm add ws && pnpm add -D @types/ws
   ```
2. Verify `ws` and `@types/ws` appear in `package.json`.
3. Run: `harness validate`
4. Commit: `chore(orchestrator): add ws dependency for WebSocket support`

---

### Task 2: Create WebSocket broadcaster module (test first)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/server/websocket.ts`, `packages/orchestrator/tests/server/websocket.test.ts`

1. Create test file `packages/orchestrator/tests/server/websocket.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { WebSocket } from 'ws';
import { WebSocketBroadcaster } from '../../src/server/websocket';

describe('WebSocketBroadcaster', () => {
  let httpServer: http.Server;
  let broadcaster: WebSocketBroadcaster;
  let port: number;

  beforeEach(async () => {
    port = Math.floor(Math.random() * 10000) + 20000;
    httpServer = http.createServer();
    broadcaster = new WebSocketBroadcaster(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(port, '127.0.0.1', resolve);
    });
  });

  afterEach(async () => {
    broadcaster.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('accepts WebSocket connections on /ws path', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects WebSocket connections on non-/ws paths', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/other`);
    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  it('broadcasts a message to all connected clients', async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await Promise.all([
      new Promise<void>((r) => ws1.on('open', r)),
      new Promise<void>((r) => ws2.on('open', r)),
    ]);

    const received1: string[] = [];
    const received2: string[] = [];
    ws1.on('message', (data) => received1.push(data.toString()));
    ws2.on('message', (data) => received2.push(data.toString()));

    broadcaster.broadcast('state_change', { running: [] });

    // Give time for messages to arrive
    await new Promise((r) => setTimeout(r, 100));

    expect(received1).toHaveLength(1);
    expect(JSON.parse(received1[0])).toEqual({
      type: 'state_change',
      data: { running: [] },
    });
    expect(received2).toHaveLength(1);
    expect(JSON.parse(received2[0])).toEqual({
      type: 'state_change',
      data: { running: [] },
    });

    ws1.close();
    ws2.close();
  });

  it('handles client disconnection gracefully', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));
    ws.close();
    await new Promise((r) => setTimeout(r, 50));

    // Should not throw when broadcasting to zero clients
    expect(() => broadcaster.broadcast('state_change', {})).not.toThrow();
  });

  it('returns connected client count', async () => {
    expect(broadcaster.clientCount).toBe(0);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));
    // Small delay for server to register connection
    await new Promise((r) => setTimeout(r, 50));

    expect(broadcaster.clientCount).toBe(1);
    ws.close();
  });
});
```

2. Run test -- observe failure:

   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/websocket.test.ts
   ```

3. Create implementation `packages/orchestrator/src/server/websocket.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * Manages WebSocket connections and broadcasts typed messages to all clients.
 *
 * Attaches to an existing HTTP server via the 'upgrade' event.
 * Only accepts connections to the /ws path.
 */
export class WebSocketBroadcaster {
  private wss: WebSocketServer;

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });
  }

  /**
   * Broadcast a typed message to all connected clients.
   *
   * @param type - Message type discriminator (e.g. 'state_change', 'interaction_new', 'agent_event')
   * @param data - Payload to send
   */
  broadcast(type: string, data: unknown): void {
    const message = JSON.stringify({ type, data });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /** Number of currently connected clients. */
  get clientCount(): number {
    return this.wss.clients.size;
  }

  /** Close all connections and the underlying WebSocketServer. */
  close(): void {
    for (const client of this.wss.clients) {
      client.close();
    }
    this.wss.close();
  }
}
```

4. Run test -- observe pass:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/websocket.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add WebSocket broadcaster module`

---

### Task 3: Extend HTTP server to support WebSocket and event wiring (test first)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/tests/server/http.test.ts`

1. Update the `Snapshotable` interface in `packages/orchestrator/src/server/http.ts` to also support event subscription:

```typescript
import * as http from 'node:http';
import * as path from 'node:path';
import { WebSocketBroadcaster } from './websocket';
import type { InteractionQueue, PendingInteraction } from '../core/interaction-queue';

export interface Snapshotable {
  getSnapshot(): Record<string, unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ServerDependencies {
  orchestrator: Snapshotable;
  interactionQueue?: InteractionQueue;
  plansDir?: string;
  dashboardDir?: string;
}

export class OrchestratorServer {
  private httpServer: http.Server;
  private broadcaster: WebSocketBroadcaster;
  private orchestrator: Snapshotable;
  private interactionQueue?: InteractionQueue;
  private plansDir: string;
  private dashboardDir: string;
  private port: number;

  constructor(orchestrator: Snapshotable, port: number, deps?: Partial<ServerDependencies>) {
    this.orchestrator = orchestrator;
    this.port = port;
    this.interactionQueue = deps?.interactionQueue;
    this.plansDir = deps?.plansDir ?? path.resolve('docs/plans');
    this.dashboardDir = deps?.dashboardDir ?? path.resolve('packages/dashboard/dist');
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.httpServer);

    // Wire orchestrator events to WebSocket broadcasts
    this.orchestrator.on('state_change', (snapshot: unknown) => {
      this.broadcaster.broadcast('state_change', snapshot);
    });
    this.orchestrator.on('agent_event', (event: unknown) => {
      this.broadcaster.broadcast('agent_event', event);
    });
  }

  /**
   * Broadcast a new interaction to all WebSocket clients.
   * Called by the orchestrator when a new interaction is pushed.
   */
  public broadcastInteraction(interaction: PendingInteraction): void {
    this.broadcaster.broadcast('interaction_new', interaction);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const { method, url } = req;

    if (method === 'GET' && url === '/api/v1/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.orchestrator.getSnapshot()));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  public get wsClientCount(): number {
    return this.broadcaster.clientCount;
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, '127.0.0.1', () => {
        console.log(`Orchestrator API listening on localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): void {
    this.broadcaster.close();
    this.httpServer.close();
  }
}
```

2. Update test file `packages/orchestrator/tests/server/http.test.ts` to cover the new WebSocket wiring:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { OrchestratorServer } from '../../src/server/http';

describe('OrchestratorServer', () => {
  let server: OrchestratorServer;
  let mockOrchestrator: EventEmitter & { getSnapshot: ReturnType<typeof vi.fn> };
  let port: number;

  beforeEach(() => {
    port = Math.floor(Math.random() * 10000) + 10000;
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    });
    server = new OrchestratorServer(mockOrchestrator, port);
  });

  afterEach(async () => {
    server.stop();
    // Small delay for cleanup
    await new Promise((r) => setTimeout(r, 50));
  });

  it('exposes GET /api/v1/state', async () => {
    await server.start();

    const response = await new Promise((resolve) => {
      http.get(`http://localhost:${port}/api/v1/state`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        });
      });
    });

    expect((response as any).statusCode).toBe(200);
    expect((response as any).body).toEqual({ running: [], retryAttempts: [], claimed: [] });
    expect(mockOrchestrator.getSnapshot).toHaveBeenCalled();
  });

  it('returns 404 for unknown routes', async () => {
    await server.start();

    const response = await new Promise((resolve) => {
      http.get(`http://localhost:${port}/unknown`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode });
        });
      });
    });

    expect((response as any).statusCode).toBe(404);
  });

  it('broadcasts state_change events to WebSocket clients', async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    mockOrchestrator.emit('state_change', { running: ['issue-1'] });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({
      type: 'state_change',
      data: { running: ['issue-1'] },
    });

    ws.close();
  });

  it('broadcasts agent_event events to WebSocket clients', async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    mockOrchestrator.emit('agent_event', { issueId: 'x', event: { type: 'thought' } });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe('agent_event');
    expect(parsed.data.issueId).toBe('x');

    ws.close();
  });

  it('broadcasts interaction_new via broadcastInteraction', async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    server.broadcastInteraction({
      id: 'int-1',
      issueId: 'issue-1',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test Issue',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe('interaction_new');
    expect(parsed.data.id).toBe('int-1');

    ws.close();
  });
});
```

3. Run tests -- observe pass:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/http.test.ts
   ```
4. Run: `harness validate`
5. Commit: `feat(orchestrator): extend HTTP server with WebSocket support and event wiring`

---

### Task 4: Wire interactionQueue into OrchestratorServer and broadcast on push (test first)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/core/interaction-queue.ts`

1. Extend the `InteractionQueue.push` method to accept an optional `onPush` callback. Alternatively (simpler), add a callback registration method:

   In `packages/orchestrator/src/core/interaction-queue.ts`, add an `onPush` hook:

```typescript
// Add after the `dir` field declaration:
private pushListeners: Array<(interaction: PendingInteraction) => void> = [];

/**
 * Register a listener that fires after each push.
 */
onPush(listener: (interaction: PendingInteraction) => void): void {
  this.pushListeners.push(listener);
}
```

Then update the `push` method to call listeners after writing:

```typescript
async push(interaction: PendingInteraction): Promise<void> {
  await fs.mkdir(this.dir, { recursive: true });
  const filePath = path.join(this.dir, `${interaction.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(interaction, null, 2), 'utf-8');
  for (const listener of this.pushListeners) {
    listener(interaction);
  }
}
```

2. In `packages/orchestrator/src/orchestrator.ts`, pass the interactionQueue to the server and wire the broadcast:

   Update the server construction (around line 96):

```typescript
if (config.server?.port) {
  this.server = new OrchestratorServer(this, config.server.port, {
    interactionQueue: this.interactionQueue,
    plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
  });

  // Wire interaction push -> WebSocket broadcast
  this.interactionQueue.onPush((interaction) => {
    this.server?.broadcastInteraction(interaction);
  });
}
```

3. Add a test to `packages/orchestrator/tests/core/interaction-queue.test.ts` for the onPush listener:

```typescript
describe('onPush listener', () => {
  it('calls registered listeners when an interaction is pushed', async () => {
    const listener = vi.fn();
    queue.onPush(listener);

    const interaction: PendingInteraction = {
      id: 'int-callback-1',
      issueId: 'issue-cb',
      type: 'needs-human',
      reasons: ['test callback'],
      context: {
        issueTitle: 'Callback Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    };

    await queue.push(interaction);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(interaction);
  });
});
```

4. Run tests:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/interaction-queue.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(orchestrator): wire interaction queue push to WebSocket broadcast`

---

### Task 5: Interactions REST routes (test first)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/server/routes/interactions.ts`, `packages/orchestrator/tests/server/routes/interactions.test.ts`

1. Create test file `packages/orchestrator/tests/server/routes/interactions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { InteractionQueue } from '../../../src/core/interaction-queue';
import { handleInteractionsRoute } from '../../../src/server/routes/interactions';

function createServer(queue: InteractionQueue): http.Server {
  return http.createServer((req, res) => {
    if (!handleInteractionsRoute(req, res, queue)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function request(
  server: http.Server,
  port: number,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('interactions routes', () => {
  let tmpDir: string;
  let queue: InteractionQueue;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'int-route-test-'));
    queue = new InteractionQueue(tmpDir);
    port = Math.floor(Math.random() * 10000) + 30000;
    server = createServer(queue);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/interactions returns empty array initially', async () => {
    const res = await request(server, port, 'GET', '/api/interactions');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/interactions returns pushed interactions', async () => {
    await queue.push({
      id: 'int-1',
      issueId: 'issue-1',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    const res = await request(server, port, 'GET', '/api/interactions');
    expect(res.statusCode).toBe(200);
    expect((res.body as any[]).length).toBe(1);
    expect((res.body as any[])[0].id).toBe('int-1');
  });

  it('PATCH /api/interactions/:id updates status', async () => {
    await queue.push({
      id: 'int-2',
      issueId: 'issue-2',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    const res = await request(server, port, 'PATCH', '/api/interactions/int-2', {
      status: 'resolved',
    });
    expect(res.statusCode).toBe(200);

    const listRes = await request(server, port, 'GET', '/api/interactions');
    expect((listRes.body as any[])[0].status).toBe('resolved');
  });

  it('PATCH /api/interactions/:id returns 404 for unknown id', async () => {
    const res = await request(server, port, 'PATCH', '/api/interactions/nonexistent', {
      status: 'resolved',
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /api/interactions/:id returns 400 for invalid status', async () => {
    await queue.push({
      id: 'int-3',
      issueId: 'issue-3',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    const res = await request(server, port, 'PATCH', '/api/interactions/int-3', {
      status: 'invalid',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns false for non-matching routes', async () => {
    const res = await request(server, port, 'GET', '/api/other');
    expect(res.statusCode).toBe(404);
  });
});
```

2. Run test -- observe failure:

   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/routes/interactions.test.ts
   ```

3. Create `packages/orchestrator/src/server/routes/interactions.ts`:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { InteractionQueue } from '../../core/interaction-queue';

const VALID_STATUSES = new Set(['pending', 'claimed', 'resolved']);

/**
 * Handle interactions API routes.
 *
 * @returns true if the route was handled, false otherwise
 */
export function handleInteractionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  queue: InteractionQueue
): boolean {
  const { method, url } = req;

  // GET /api/interactions
  if (method === 'GET' && url === '/api/interactions') {
    void (async () => {
      try {
        const interactions = await queue.list();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(interactions));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to list interactions' }));
      }
    })();
    return true;
  }

  // PATCH /api/interactions/:id
  const patchMatch = method === 'PATCH' && url?.match(/^\/api\/interactions\/([^/]+)$/);
  if (patchMatch) {
    const id = patchMatch[1];
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { status?: string };

        if (!parsed.status || !VALID_STATUSES.has(parsed.status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Invalid status. Must be pending, claimed, or resolved.' })
          );
          return;
        }

        await queue.updateStatus(id, parsed.status as 'pending' | 'claimed' | 'resolved');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Interaction ${id} not found` }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to update interaction' }));
        }
      }
    })();
    return true;
  }

  return false;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
```

4. Run test -- observe pass:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/routes/interactions.test.ts
   ```
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add interactions REST routes`

---

### Task 6: Plans write endpoint (test first)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/server/routes/plans.ts`, `packages/orchestrator/tests/server/routes/plans.test.ts`

1. Create test file `packages/orchestrator/tests/server/routes/plans.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handlePlansRoute } from '../../../src/server/routes/plans';

function createServer(plansDir: string): http.Server {
  return http.createServer((req, res) => {
    if (!handlePlansRoute(req, res, plansDir)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('plans routes', () => {
  let tmpDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plans-route-test-'));
    port = Math.floor(Math.random() * 10000) + 31000;
    server = createServer(tmpDir);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/plans writes a plan file and returns 201', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: '2026-04-14-test-plan.md',
      content: '# Test Plan\n\nContent here.',
    });
    expect(res.statusCode).toBe(201);

    const filePath = path.join(tmpDir, '2026-04-14-test-plan.md');
    const written = await fs.readFile(filePath, 'utf-8');
    expect(written).toBe('# Test Plan\n\nContent here.');
  });

  it('POST /api/plans returns 400 when filename is missing', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      content: 'no filename',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plans returns 400 when content is missing', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: 'test.md',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plans rejects path traversal in filename', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: '../../../etc/passwd',
      content: 'malicious',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/plans rejects non-.md filenames', async () => {
    const res = await request(port, 'POST', '/api/plans', {
      filename: 'script.sh',
      content: 'malicious',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns false for non-matching routes', async () => {
    const res = await request(port, 'GET', '/api/other');
    expect(res.statusCode).toBe(404);
  });
});
```

2. Run test -- observe failure.

3. Create `packages/orchestrator/src/server/routes/plans.ts`:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Handle plan write API routes.
 *
 * @returns true if the route was handled, false otherwise
 */
export function handlePlansRoute(
  req: IncomingMessage,
  res: ServerResponse,
  plansDir: string
): boolean {
  const { method, url } = req;

  if (method === 'POST' && url === '/api/plans') {
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as { filename?: string; content?: string };

        if (!parsed.filename || typeof parsed.filename !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid filename' }));
          return;
        }

        if (!parsed.content || typeof parsed.content !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or invalid content' }));
          return;
        }

        // Security: reject path traversal and non-.md files
        const basename = path.basename(parsed.filename);
        if (basename !== parsed.filename || !basename.endsWith('.md')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Filename must be a simple .md filename (no path separators)' })
          );
          return;
        }

        await fs.mkdir(plansDir, { recursive: true });
        const filePath = path.join(plansDir, basename);
        await fs.writeFile(filePath, parsed.content, 'utf-8');

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: filePath }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write plan' }));
      }
    })();
    return true;
  }

  return false;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
```

4. Run test -- observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add plan write REST endpoint`

---

### Task 7: Chat proxy endpoint with SSE streaming (test first)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/server/routes/chat-proxy.ts`, `packages/orchestrator/tests/server/routes/chat-proxy.test.ts`

1. Create test file `packages/orchestrator/tests/server/routes/chat-proxy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { handleChatProxyRoute } from '../../../src/server/routes/chat-proxy';

// Mock Anthropic client to avoid real API calls
const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: 'Hello' },
    };
    yield {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: ' world' },
    };
  },
  async finalMessage() {
    return {
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  },
};

const mockAnthropicClient = {
  messages: {
    stream: vi.fn().mockReturnValue(mockStream),
  },
};

function createServer(): http.Server {
  return http.createServer((req, res) => {
    if (!handleChatProxyRoute(req, res, mockAnthropicClient as any)) {
      res.writeHead(404);
      res.end();
    }
  });
}

function postRequest(
  port: number,
  urlPath: string,
  body: unknown
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

describe('chat proxy route', () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    port = Math.floor(Math.random() * 10000) + 32000;
    mockAnthropicClient.messages.stream.mockReturnValue(mockStream);
    server = createServer();
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(() => {
    server.close();
  });

  it('POST /api/chat streams SSE responses', async () => {
    const res = await postRequest(port, '/api/chat', {
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.body).toContain('data: ');
    expect(res.body).toContain('Hello');
    expect(res.body).toContain(' world');
    expect(res.body).toContain('[DONE]');
  });

  it('POST /api/chat returns 400 when messages are missing', async () => {
    const res = await postRequest(port, '/api/chat', {});
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/chat passes system prompt when provided', async () => {
    await postRequest(port, '/api/chat', {
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
    });

    expect(mockAnthropicClient.messages.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'You are a helpful assistant.',
      })
    );
  });

  it('returns false for non-matching routes', async () => {
    const res = await postRequest(port, '/api/other', {});
    expect(res.statusCode).toBe(404);
  });
});
```

2. Run test -- observe failure.

3. Create `packages/orchestrator/src/server/routes/chat-proxy.ts`:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import type Anthropic from '@anthropic-ai/sdk';

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Handle the chat proxy route. Proxies to the Anthropic API and streams
 * responses back as Server-Sent Events (SSE).
 *
 * @param client - Anthropic SDK client instance (or compatible mock)
 * @returns true if the route was handled, false otherwise
 */
export function handleChatProxyRoute(
  req: IncomingMessage,
  res: ServerResponse,
  client: Anthropic
): boolean {
  const { method, url } = req;

  if (method === 'POST' && url === '/api/chat') {
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as ChatRequest;

        if (!parsed.messages || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing or empty messages array' }));
          return;
        }

        // Set SSE headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        const streamParams: Record<string, unknown> = {
          model: parsed.model ?? 'claude-sonnet-4-20250514',
          max_tokens: parsed.maxTokens ?? 8192,
          messages: parsed.messages,
        };
        if (parsed.system) {
          streamParams.system = parsed.system;
        }

        const stream = client.messages.stream(streamParams as any);

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            'delta' in event &&
            event.delta &&
            typeof event.delta === 'object' &&
            'text' in event.delta
          ) {
            const text = (event.delta as { text: string }).text;
            res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
          }
        }

        // Send final usage
        const finalMessage = await stream.finalMessage();
        const usage = finalMessage.usage;
        res.write(
          `data: ${JSON.stringify({ type: 'usage', inputTokens: usage.input_tokens, outputTokens: usage.output_tokens })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Chat proxy error';
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: errorMsg }));
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
          res.end();
        }
      }
    })();
    return true;
  }

  return false;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
```

4. Run test -- observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add chat proxy endpoint with SSE streaming`

---

### Task 8: Static file serving with SPA fallback (test first)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/server/static.ts`, `packages/orchestrator/tests/server/static.test.ts`

1. Create test file `packages/orchestrator/tests/server/static.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleStaticFile } from '../../src/server/static';

function createServer(dashboardDir: string): http.Server {
  return http.createServer((req, res) => {
    if (!handleStaticFile(req, res, dashboardDir)) {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

function get(
  port: number,
  urlPath: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 500, headers: res.headers, body: data });
        });
      })
      .on('error', reject);
  });
}

describe('static file serving', () => {
  let tmpDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'static-test-'));
    port = Math.floor(Math.random() * 10000) + 33000;

    // Create mock dashboard files
    await fs.writeFile(path.join(tmpDir, 'index.html'), '<html>Dashboard</html>');
    await fs.mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'assets', 'app.js'), 'console.log("app")');
    await fs.writeFile(path.join(tmpDir, 'assets', 'style.css'), 'body {}');

    server = createServer(tmpDir);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  });

  afterEach(async () => {
    server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('serves index.html for root path', async () => {
    const res = await get(port, '/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Dashboard');
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('serves static files with correct MIME types', async () => {
    const js = await get(port, '/assets/app.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');

    const css = await get(port, '/assets/style.css');
    expect(css.statusCode).toBe(200);
    expect(css.headers['content-type']).toContain('css');
  });

  it('SPA fallback: returns index.html for unknown non-API paths', async () => {
    const res = await get(port, '/some/deep/route');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Dashboard');
  });

  it('does not handle API paths', async () => {
    const res = await get(port, '/api/v1/state');
    expect(res.statusCode).toBe(404);
  });

  it('rejects path traversal attempts', async () => {
    const res = await get(port, '/../../../etc/passwd');
    expect(res.statusCode).toBe(200); // Falls through to SPA fallback with index.html
    expect(res.body).toContain('Dashboard');
  });
});
```

2. Run test -- observe failure.

3. Create `packages/orchestrator/src/server/static.ts`:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Serve static files from the dashboard dist directory.
 * Falls back to index.html for SPA client-side routing.
 *
 * Does NOT handle /api/* or /ws paths (returns false for those).
 *
 * @returns true if the request was handled, false otherwise
 */
export function handleStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  dashboardDir: string
): boolean {
  const { method, url } = req;

  // Only handle GET requests
  if (method !== 'GET') return false;

  // Don't handle API or WebSocket paths
  if (url?.startsWith('/api/') || url === '/ws') return false;

  const urlPath = new URL(url ?? '/', 'http://localhost').pathname;

  // Resolve and verify the path is within dashboardDir
  const requestedPath = path.join(dashboardDir, urlPath === '/' ? 'index.html' : urlPath);
  const resolved = path.resolve(requestedPath);

  // Security: ensure resolved path is within dashboardDir
  if (!resolved.startsWith(path.resolve(dashboardDir))) {
    // SPA fallback
    return serveFile(path.join(dashboardDir, 'index.html'), res);
  }

  // Try to serve the requested file
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return serveFile(resolved, res);
  }

  // SPA fallback: serve index.html for all other paths
  const indexPath = path.join(dashboardDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return serveFile(indexPath, res);
  }

  return false;
}

function serveFile(filePath: string, res: ServerResponse): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
```

4. Run test -- observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add static file serving with SPA fallback`

---

### Task 9: Plan file watcher with auto-resolve (test first)

**Depends on:** Task 4 (interactionQueue) | **Files:** `packages/orchestrator/src/server/plan-watcher.ts`, `packages/orchestrator/tests/server/plan-watcher.test.ts`

1. Create test file `packages/orchestrator/tests/server/plan-watcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PlanWatcher } from '../../src/server/plan-watcher';
import { InteractionQueue } from '../../src/core/interaction-queue';

describe('PlanWatcher', () => {
  let plansDir: string;
  let interactionsDir: string;
  let queue: InteractionQueue;
  let watcher: PlanWatcher;

  beforeEach(async () => {
    plansDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-watcher-plans-'));
    interactionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-watcher-int-'));
    queue = new InteractionQueue(interactionsDir);
  });

  afterEach(async () => {
    if (watcher) watcher.stop();
    await fs.rm(plansDir, { recursive: true, force: true });
    await fs.rm(interactionsDir, { recursive: true, force: true });
  });

  it('resolves a pending interaction when a matching plan file is created', async () => {
    // Push an interaction for issue "CORE-42"
    await queue.push({
      id: 'int-core42',
      issueId: 'CORE-42',
      type: 'needs-human',
      reasons: ['full-exploration'],
      context: {
        issueTitle: 'CORE-42: Implement feature',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    watcher = new PlanWatcher(plansDir, queue);
    watcher.start();

    // Create a plan file that matches the issueId
    await fs.writeFile(
      path.join(plansDir, '2026-04-14-CORE-42-feature-plan.md'),
      '# Plan for CORE-42'
    );

    // Wait for the watcher to detect and process
    await new Promise((r) => setTimeout(r, 500));

    const interactions = await queue.list();
    const resolved = interactions.find((i) => i.id === 'int-core42');
    expect(resolved?.status).toBe('resolved');
  });

  it('does not resolve interactions for non-matching plan files', async () => {
    await queue.push({
      id: 'int-core99',
      issueId: 'CORE-99',
      type: 'needs-human',
      reasons: ['full-exploration'],
      context: {
        issueTitle: 'CORE-99: Other feature',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    watcher = new PlanWatcher(plansDir, queue);
    watcher.start();

    // Create a plan file that does NOT match CORE-99
    await fs.writeFile(
      path.join(plansDir, '2026-04-14-CORE-50-other-plan.md'),
      '# Plan for CORE-50'
    );

    await new Promise((r) => setTimeout(r, 500));

    const interactions = await queue.list();
    const pending = interactions.find((i) => i.id === 'int-core99');
    expect(pending?.status).toBe('pending');
  });

  it('ignores non-.md files', async () => {
    await queue.push({
      id: 'int-core10',
      issueId: 'CORE-10',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'CORE-10',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      status: 'pending',
    });

    watcher = new PlanWatcher(plansDir, queue);
    watcher.start();

    await fs.writeFile(path.join(plansDir, 'CORE-10-notes.txt'), 'notes');

    await new Promise((r) => setTimeout(r, 500));

    const interactions = await queue.list();
    expect(interactions.find((i) => i.id === 'int-core10')?.status).toBe('pending');
  });
});
```

2. Run test -- observe failure.

3. Create `packages/orchestrator/src/server/plan-watcher.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InteractionQueue } from '../core/interaction-queue';

/**
 * Watches the plans directory for new .md files and auto-resolves
 * matching pending interactions in the InteractionQueue.
 *
 * A plan file "matches" an interaction if the filename contains the
 * interaction's issueId (case-insensitive comparison).
 */
export class PlanWatcher {
  private plansDir: string;
  private queue: InteractionQueue;
  private watcher: fs.FSWatcher | null = null;

  constructor(plansDir: string, queue: InteractionQueue) {
    this.plansDir = plansDir;
    this.queue = queue;
  }

  /**
   * Start watching the plans directory.
   * Creates the directory if it does not exist.
   */
  start(): void {
    // Ensure directory exists
    fs.mkdirSync(this.plansDir, { recursive: true });

    this.watcher = fs.watch(this.plansDir, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.md')) {
        // 'rename' fires on file creation. Verify the file actually exists.
        const filePath = path.join(this.plansDir, filename);
        if (fs.existsSync(filePath)) {
          void this.handleNewPlan(filename);
        }
      }
    });
  }

  /**
   * Stop watching.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private async handleNewPlan(filename: string): Promise<void> {
    const upperFilename = filename.toUpperCase();

    try {
      const pending = await this.queue.listPending();

      for (const interaction of pending) {
        const upperIssueId = interaction.issueId.toUpperCase();
        if (upperFilename.includes(upperIssueId)) {
          await this.queue.updateStatus(interaction.id, 'resolved');
        }
      }
    } catch {
      // Silently ignore errors -- watcher is best-effort
    }
  }
}
```

4. Run test -- observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add plan file watcher with auto-resolve`

---

### Task 10: Integrate all routes into OrchestratorServer

**Depends on:** Tasks 5, 6, 7, 8, 9 | **Files:** `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/orchestrator.ts`

1. Update `packages/orchestrator/src/server/http.ts` to wire in all route handlers:

```typescript
import * as http from 'node:http';
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { WebSocketBroadcaster } from './websocket';
import { handleInteractionsRoute } from './routes/interactions';
import { handlePlansRoute } from './routes/plans';
import { handleChatProxyRoute } from './routes/chat-proxy';
import { handleStaticFile } from './static';
import { PlanWatcher } from './plan-watcher';
import type { InteractionQueue, PendingInteraction } from '../core/interaction-queue';

export interface Snapshotable {
  getSnapshot(): Record<string, unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ServerDependencies {
  interactionQueue?: InteractionQueue;
  plansDir?: string;
  dashboardDir?: string;
  anthropicClient?: Anthropic;
}

export class OrchestratorServer {
  private httpServer: http.Server;
  private broadcaster: WebSocketBroadcaster;
  private orchestrator: Snapshotable;
  private interactionQueue?: InteractionQueue;
  private plansDir: string;
  private dashboardDir: string;
  private port: number;
  private anthropicClient: Anthropic | null;
  private planWatcher: PlanWatcher | null = null;

  constructor(orchestrator: Snapshotable, port: number, deps?: ServerDependencies) {
    this.orchestrator = orchestrator;
    this.port = port;
    this.interactionQueue = deps?.interactionQueue;
    this.plansDir = deps?.plansDir ?? path.resolve('docs/plans');
    this.dashboardDir = deps?.dashboardDir ?? path.resolve('packages/dashboard/dist');
    this.httpServer = http.createServer(this.handleRequest.bind(this));
    this.broadcaster = new WebSocketBroadcaster(this.httpServer);

    // Only create Anthropic client if API key is available
    this.anthropicClient =
      deps?.anthropicClient ??
      (process.env.ANTHROPIC_API_KEY
        ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        : null);

    // Wire orchestrator events to WebSocket broadcasts
    this.orchestrator.on('state_change', (snapshot: unknown) => {
      this.broadcaster.broadcast('state_change', snapshot);
    });
    this.orchestrator.on('agent_event', (event: unknown) => {
      this.broadcaster.broadcast('agent_event', event);
    });
  }

  public broadcastInteraction(interaction: PendingInteraction): void {
    this.broadcaster.broadcast('interaction_new', interaction);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const { method, url } = req;

    // Existing state endpoint
    if (method === 'GET' && url === '/api/v1/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.orchestrator.getSnapshot()));
      return;
    }

    // Interactions routes
    if (this.interactionQueue && handleInteractionsRoute(req, res, this.interactionQueue)) {
      return;
    }

    // Plans route
    if (handlePlansRoute(req, res, this.plansDir)) {
      return;
    }

    // Chat proxy route
    if (this.anthropicClient && handleChatProxyRoute(req, res, this.anthropicClient)) {
      return;
    }

    // Static file serving (must be last -- SPA fallback)
    if (handleStaticFile(req, res, this.dashboardDir)) {
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  public get wsClientCount(): number {
    return this.broadcaster.clientCount;
  }

  public async start(): Promise<void> {
    // Start plan watcher if interaction queue is available
    if (this.interactionQueue) {
      this.planWatcher = new PlanWatcher(this.plansDir, this.interactionQueue);
      this.planWatcher.start();
    }

    return new Promise((resolve) => {
      this.httpServer.listen(this.port, '127.0.0.1', () => {
        console.log(`Orchestrator API listening on localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): void {
    if (this.planWatcher) {
      this.planWatcher.stop();
      this.planWatcher = null;
    }
    this.broadcaster.close();
    this.httpServer.close();
  }
}
```

2. Update `packages/orchestrator/src/orchestrator.ts` to pass dependencies:

   Replace the server construction block (around line 95-97):

```typescript
if (config.server?.port) {
  this.server = new OrchestratorServer(this, config.server.port, {
    interactionQueue: this.interactionQueue,
    plansDir: path.resolve(config.workspace.root, '..', 'docs', 'plans'),
  });

  this.interactionQueue.onPush((interaction) => {
    this.server?.broadcastInteraction(interaction);
  });
}
```

3. Run all server tests:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/
   ```
4. Run full test suite:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts
   ```
5. Run: `harness validate`
6. Commit: `feat(orchestrator): integrate all routes into OrchestratorServer`

---

### Task 11: Integration test -- full server flow

**Depends on:** Task 10 | **Files:** `packages/orchestrator/tests/server/integration.test.ts`

1. Create `packages/orchestrator/tests/server/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { OrchestratorServer } from '../../src/server/http';
import { InteractionQueue } from '../../src/core/interaction-queue';

function request(
  port: number,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 500,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('OrchestratorServer integration', () => {
  let tmpDir: string;
  let interactionsDir: string;
  let plansDir: string;
  let dashboardDir: string;
  let server: OrchestratorServer;
  let queue: InteractionQueue;
  let mockOrchestrator: EventEmitter & { getSnapshot: () => Record<string, unknown> };
  let port: number;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'server-int-test-'));
    interactionsDir = path.join(tmpDir, 'interactions');
    plansDir = path.join(tmpDir, 'plans');
    dashboardDir = path.join(tmpDir, 'dashboard');

    await fs.mkdir(interactionsDir, { recursive: true });
    await fs.mkdir(plansDir, { recursive: true });
    await fs.mkdir(dashboardDir, { recursive: true });
    await fs.writeFile(path.join(dashboardDir, 'index.html'), '<html>Dashboard</html>');

    queue = new InteractionQueue(interactionsDir);
    port = Math.floor(Math.random() * 10000) + 35000;
    mockOrchestrator = Object.assign(new EventEmitter(), {
      getSnapshot: () => ({ running: [], retryAttempts: [], claimed: [] }),
    });

    server = new OrchestratorServer(mockOrchestrator, port, {
      interactionQueue: queue,
      plansDir,
      dashboardDir,
    });

    queue.onPush((interaction) => {
      server.broadcastInteraction(interaction);
    });

    await server.start();
  });

  afterEach(async () => {
    server.stop();
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('SC6: escalated interaction broadcasts via WebSocket within 5 seconds', async () => {
    // Connect a WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: unknown[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));

    // Push an interaction (simulating escalation)
    const startTime = Date.now();
    await queue.push({
      id: 'int-sc6',
      issueId: 'ISSUE-SC6',
      type: 'needs-human',
      reasons: ['full-exploration'],
      context: {
        issueTitle: 'Test SC6',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    });

    await new Promise((r) => setTimeout(r, 200));
    const elapsed = Date.now() - startTime;

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const interactionMsg = messages.find((m: any) => m.type === 'interaction_new') as any;
    expect(interactionMsg).toBeDefined();
    expect(interactionMsg.data.id).toBe('int-sc6');
    expect(elapsed).toBeLessThan(5000);

    ws.close();
  });

  it('SC8: plan saved resolves interaction and file exists on disk', async () => {
    // Push a pending interaction
    await queue.push({
      id: 'int-sc8',
      issueId: 'ISSUE-SC8',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'Test SC8',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    });

    // Write a plan via the API
    const writeRes = await request(port, 'POST', '/api/plans', {
      filename: '2026-04-14-ISSUE-SC8-plan.md',
      content: '# Plan for ISSUE-SC8',
    });
    expect(writeRes.statusCode).toBe(201);

    // Verify file exists on disk
    const planFile = path.join(plansDir, '2026-04-14-ISSUE-SC8-plan.md');
    const content = await fs.readFile(planFile, 'utf-8');
    expect(content).toBe('# Plan for ISSUE-SC8');

    // Wait for plan watcher to auto-resolve
    await new Promise((r) => setTimeout(r, 1000));

    const interactions = await queue.list();
    const resolved = interactions.find((i) => i.id === 'int-sc8');
    expect(resolved?.status).toBe('resolved');
  });

  it('state snapshot endpoint still works', async () => {
    const res = await request(port, 'GET', '/api/v1/state');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ running: [], retryAttempts: [], claimed: [] });
  });

  it('interactions CRUD works end-to-end', async () => {
    await queue.push({
      id: 'int-crud',
      issueId: 'CRUD-1',
      type: 'needs-human',
      reasons: ['test'],
      context: {
        issueTitle: 'CRUD Test',
        issueDescription: null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    });

    const listRes = await request(port, 'GET', '/api/interactions');
    expect(listRes.statusCode).toBe(200);
    expect((listRes.body as any[]).length).toBe(1);

    const patchRes = await request(port, 'PATCH', '/api/interactions/int-crud', {
      status: 'claimed',
    });
    expect(patchRes.statusCode).toBe(200);

    const listRes2 = await request(port, 'GET', '/api/interactions');
    expect((listRes2.body as any[])[0].status).toBe('claimed');
  });

  it('static files served from dashboard dir', async () => {
    const res = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      http.get(`http://127.0.0.1:${port}/`, (r) => {
        let data = '';
        r.on('data', (chunk) => (data += chunk));
        r.on('end', () => resolve({ statusCode: r.statusCode ?? 500, body: data }));
      });
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Dashboard');
  });
});
```

2. Run test:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts tests/server/integration.test.ts
   ```
3. Run: `harness validate`
4. Commit: `test(orchestrator): add server integration tests for SC6 and SC8`

---

### Task 12: Full test suite pass and final validation

**Depends on:** Task 11 | **Files:** none (validation only)

[checkpoint:human-verify] -- Run full test suite and verify all pass.

1. Run the complete orchestrator test suite:
   ```bash
   npx vitest run --config packages/orchestrator/vitest.config.mts
   ```
2. Run: `harness validate`
3. Run: `harness check-deps`
4. Verify no TypeScript errors:
   ```bash
   cd packages/orchestrator && npx tsc --noEmit
   ```
5. If any failures, fix and re-run. Do not commit if tests fail.
6. Final commit (if any fixes needed): `chore(orchestrator): fix Phase 2 test/lint issues`
