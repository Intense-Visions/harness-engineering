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
    const interactionMsg = messages.find(
      (m: unknown) => (m as Record<string, unknown>).type === 'interaction_new'
    ) as Record<string, unknown> | undefined;
    expect(interactionMsg).toBeDefined();
    expect((interactionMsg?.data as Record<string, unknown>)?.id).toBe('int-sc6');
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
    expect((listRes.body as unknown[]).length).toBe(1);

    const patchRes = await request(port, 'PATCH', '/api/interactions/int-crud', {
      status: 'claimed',
    });
    expect(patchRes.statusCode).toBe(200);

    const listRes2 = await request(port, 'GET', '/api/interactions');
    expect(((listRes2.body as unknown[])[0] as Record<string, unknown>).status).toBe('claimed');
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
