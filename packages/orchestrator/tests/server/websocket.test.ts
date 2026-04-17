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
