import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { collectEvents } from '../../src/telemetry/collector';
import type { ConsentState } from '@harness-engineering/types';

// We test the full collector → transport flow by spinning up a local HTTP server
// and overriding fetch to point at it. This avoids coupling to PostHog internals.

describe('collector → transport integration', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-integration__');
  const metricsDir = path.join(tmpDir, '.harness', 'metrics');
  const adoptionFile = path.join(metricsDir, 'adoption.jsonl');

  let server: http.Server;
  let serverPort: number;
  let receivedBodies: string[];

  beforeAll(async () => {
    receivedBodies = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        receivedBodies.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 1 }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    fs.mkdirSync(metricsDir, { recursive: true });
    receivedBodies = [];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects adoption records and sends them to an HTTP endpoint', async () => {
    // Write adoption records
    const records = [
      {
        skill: 'harness-brainstorming',
        session: 's1',
        startedAt: '2026-04-10T10:00:00Z',
        duration: 5000,
        outcome: 'completed',
        phasesReached: ['SCOPE'],
      },
      {
        skill: 'harness-planning',
        session: 's2',
        startedAt: '2026-04-10T11:00:00Z',
        duration: 3000,
        outcome: 'failed',
        phasesReached: [],
      },
    ];
    fs.writeFileSync(adoptionFile, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const consent: ConsentState = {
      allowed: true,
      installId: 'integration-test-uuid',
      identity: { project: 'test-project' },
    };

    // Collect events
    const events = collectEvents(tmpDir, consent);
    expect(events).toHaveLength(2);

    // Send events via transport -- override fetch to hit local server
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const localUrl = url.replace('https://app.posthog.com', `http://localhost:${serverPort}`);
      return originalFetch(localUrl, init);
    };

    try {
      // Dynamic import to use the overridden fetch
      const { send } = await import('../../src/telemetry/transport');
      await send(events, 'phc_integration_test_key');
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Verify server received the batch
    expect(receivedBodies).toHaveLength(1);
    const payload = JSON.parse(receivedBodies[0]!);
    expect(payload.api_key).toBe('phc_integration_test_key');
    expect(payload.batch).toHaveLength(2);
    expect(payload.batch[0].event).toBe('skill_invocation');
    expect(payload.batch[0].properties.skillName).toBe('harness-brainstorming');
    expect(payload.batch[0].properties.project).toBe('test-project');
    expect(payload.batch[1].properties.skillName).toBe('harness-planning');
    expect(payload.batch[1].properties.outcome).toBe('failure');
  });
});
