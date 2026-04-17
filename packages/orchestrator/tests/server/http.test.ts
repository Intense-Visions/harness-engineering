import { describe, it, expect, vi, beforeEach, afterEach, type TestOptions } from 'vitest';

const RETRY: TestOptions = { retry: 2 };
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

  it('broadcasts state_change events to WebSocket clients', RETRY, async () => {
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

  it('broadcasts agent_event events to WebSocket clients', RETRY, async () => {
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

  it('broadcasts interaction_new via broadcastInteraction', RETRY, async () => {
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
