import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { OrchestratorServer } from '../../src/server/http';

describe('OrchestratorServer', () => {
  let server: OrchestratorServer;
  let mockOrchestrator: any;
  let port: number;

  beforeEach(() => {
    port = Math.floor(Math.random() * 10000) + 10000;
    mockOrchestrator = {
      getSnapshot: vi.fn().mockReturnValue({ running: [], retryAttempts: [], claimed: [] }),
    };
    server = new OrchestratorServer(mockOrchestrator as any, port);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.stop();
      resolve();
    });
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
});
