import { describe, it, expect, vi, beforeEach, afterEach, type TestOptions } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import type { LocalModelStatus } from '@harness-engineering/types';
import { OrchestratorServer } from '../../src/server/http';

const RETRY: TestOptions = { retry: 2 };

const STATUS_UNHEALTHY: LocalModelStatus = {
  available: false,
  resolved: null,
  configured: ['gemma-4-e4b'],
  detected: [],
  lastProbeAt: '2026-04-30T12:00:00.000Z',
  lastError: 'fetch failed',
  warnings: ['No configured candidate is loaded.'],
};

const STATUS_HEALTHY: LocalModelStatus = {
  ...STATUS_UNHEALTHY,
  available: true,
  resolved: 'gemma-4-e4b',
  detected: ['gemma-4-e4b'],
  lastError: null,
  warnings: [],
};

describe('OrchestratorServer.broadcastLocalModelStatus (SC18)', () => {
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
    await new Promise((r) => setTimeout(r, 50));
  });

  it('delivers a single local-model:status message to connected clients (OT3)', RETRY, async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    // Drain the initial snapshot the broadcaster sends on connect.
    await new Promise((r) => setTimeout(r, 50));
    messages.length = 0;

    server.broadcastLocalModelStatus(STATUS_UNHEALTHY);
    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]) as { type: string; data: LocalModelStatus };
    expect(parsed.type).toBe('local-model:status');
    expect(parsed.data).toEqual(STATUS_UNHEALTHY);

    ws.close();
  });

  it('delivers status flips as separate messages (OT4 — recovery)', RETRY, async () => {
    await server.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((r) => ws.on('open', r));

    const messages: string[] = [];
    ws.on('message', (data) => messages.push(data.toString()));

    // Drain the initial snapshot.
    await new Promise((r) => setTimeout(r, 50));
    messages.length = 0;

    server.broadcastLocalModelStatus(STATUS_UNHEALTHY);
    server.broadcastLocalModelStatus(STATUS_HEALTHY);
    await new Promise((r) => setTimeout(r, 100));

    expect(messages).toHaveLength(2);
    const parsed = messages.map((m) => JSON.parse(m) as { type: string; data: LocalModelStatus });
    expect(parsed[0].type).toBe('local-model:status');
    expect(parsed[0].data.available).toBe(false);
    expect(parsed[1].type).toBe('local-model:status');
    expect(parsed[1].data.available).toBe(true);
    expect(parsed[1].data.resolved).toBe('gemma-4-e4b');

    ws.close();
  });
});
