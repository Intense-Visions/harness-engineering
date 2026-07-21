import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntelligencePipeline } from '@harness-engineering/intelligence';
import { handleAnalyzeRoute } from './analyze';

// ---------------------------------------------------------------------------
// Fake pipeline builders.
//
// handleAnalyzeRoute only ever calls .enrich(), .score() and .simulate() on the
// pipeline it is handed, so a structurally-typed fake cast to the real type is
// sufficient and keeps the test hermetic (no real SEL/CML/PESL work, no IO).
// The two intelligence helpers the route uses directly — manualToRawWorkItem and
// scoreToConcernSignals — are pure and run for real.
// ---------------------------------------------------------------------------

interface FakeScore {
  overall: number;
  riskLevel: string;
  confidence: number;
  blastRadius: { filesEstimated: number };
  dimensions: { semantic: number };
  reasoning: string[];
  recommendedRoute: 'local' | 'human' | 'simulation-required';
}

const LOW_SCORE: FakeScore = {
  overall: 0.3,
  riskLevel: 'low',
  confidence: 0.9,
  blastRadius: { filesEstimated: 5 },
  dimensions: { semantic: 0.2 },
  reasoning: [],
  recommendedRoute: 'local',
};

// Every scoreToConcernSignals threshold tripped: overall >= 0.7,
// filesEstimated > 20, semantic > 0.6 => three concern signals.
const HIGH_SCORE: FakeScore = {
  overall: 0.85,
  riskLevel: 'high',
  confidence: 0.8,
  blastRadius: { filesEstimated: 30 },
  dimensions: { semantic: 0.75 },
  reasoning: ['sprawling change', 'many unknowns'],
  recommendedRoute: 'simulation-required',
};

const FAKE_SPEC = {
  intent: 'add feature',
  summary: 'a summary',
  affectedSystems: ['api'],
  unknowns: ['x'],
  ambiguities: ['y'],
  riskSignals: ['z'],
};

const FAKE_SIM = { outcome: 'ok', steps: ['a', 'b'] };

function makePipeline(score: FakeScore): {
  pipeline: IntelligencePipeline;
  enrich: ReturnType<typeof vi.fn>;
  scoreFn: ReturnType<typeof vi.fn>;
  simulate: ReturnType<typeof vi.fn>;
} {
  const enrich = vi.fn(async () => FAKE_SPEC);
  const scoreFn = vi.fn(() => score);
  const simulate = vi.fn(async () => FAKE_SIM);
  const pipeline = { enrich, score: scoreFn, simulate } as unknown as IntelligencePipeline;
  return { pipeline, enrich, scoreFn, simulate };
}

// ---------------------------------------------------------------------------
// Real loopback HTTP server that routes to handleAnalyzeRoute, mirroring the
// sibling auth.test.ts style. Loopback-only, no filesystem, no external network.
// ---------------------------------------------------------------------------

interface HttpResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

let server: http.Server;
let port: number;
let currentPipeline: IntelligencePipeline | null;
let matched: boolean | undefined;

beforeEach(async () => {
  currentPipeline = null;
  matched = undefined;
  server = http.createServer((req, res) => {
    matched = handleAnalyzeRoute(req, res, currentPipeline);
    // Only respond ourselves when the route did not claim the request.
    if (!matched) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', function (this: http.Server) {
      const addr = this.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
});

afterEach(() => {
  server.close();
});

function request(
  path: string,
  method: string,
  body?: string,
  headers: Record<string, string> = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: chunks, headers: res.headers })
      );
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Parse an SSE response body into the list of decoded `data:` event objects
 * (the terminal `[DONE]` sentinel is returned separately). */
function parseSSE(body: string): {
  events: Array<{ type: string; [k: string]: unknown }>;
  done: boolean;
} {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  let done = false;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice('data: '.length);
    if (payload === '[DONE]') {
      done = true;
      continue;
    }
    events.push(JSON.parse(payload));
  }
  return { events, done };
}

const jsonHeaders = { 'Content-Type': 'application/json' };

describe('handleAnalyzeRoute', () => {
  describe('route matching (return value)', () => {
    it('does not claim a GET to /api/analyze and leaves the response untouched', () => {
      const touched: string[] = [];
      const req = { method: 'GET', url: '/api/analyze' } as IncomingMessage;
      const res = {
        writeHead: () => touched.push('writeHead'),
        write: () => touched.push('write'),
        end: () => touched.push('end'),
        on: () => touched.push('on'),
      } as unknown as ServerResponse;

      const result = handleAnalyzeRoute(req, res, null);

      expect(result).toBe(false);
      expect(touched).toEqual([]);
    });

    it('does not claim a POST to a different url', () => {
      const req = { method: 'POST', url: '/api/other' } as IncomingMessage;
      const res = {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
      } as unknown as ServerResponse;
      expect(handleAnalyzeRoute(req, res, null)).toBe(false);
    });

    it('claims a POST to /api/analyze (returns true)', async () => {
      currentPipeline = null;
      await request('/api/analyze', 'POST', JSON.stringify({ title: 'x' }), jsonHeaders);
      expect(matched).toBe(true);
    });
  });

  describe('input / configuration guards', () => {
    it('returns a 503 JSON error when the pipeline is not enabled', async () => {
      currentPipeline = null;
      const res = await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ title: 'x' }),
        jsonHeaders
      );
      expect(res.status).toBe(503);
      expect(JSON.parse(res.body)).toEqual({ error: 'Intelligence pipeline not enabled' });
    });

    it('returns a 400 JSON error when required fields are missing (Zod validation)', async () => {
      currentPipeline = makePipeline(LOW_SCORE).pipeline;
      const res = await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ description: 'no title' }),
        jsonHeaders
      );
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toHaveProperty('error');
    });

    it('returns a 400 when title is present but empty (min(1) constraint)', async () => {
      currentPipeline = makePipeline(LOW_SCORE).pipeline;
      const res = await request('/api/analyze', 'POST', JSON.stringify({ title: '' }), jsonHeaders);
      expect(res.status).toBe(400);
    });

    it('returns a 500 JSON error on malformed JSON body (JSON.parse throws pre-stream)', async () => {
      currentPipeline = makePipeline(LOW_SCORE).pipeline;
      const res = await request('/api/analyze', 'POST', '{ not json', jsonHeaders);
      expect(res.status).toBe(500);
      expect(JSON.parse(res.body)).toHaveProperty('error');
    });

    it('does not invoke the pipeline when validation fails', async () => {
      const { pipeline, enrich, scoreFn } = makePipeline(LOW_SCORE);
      currentPipeline = pipeline;
      await request('/api/analyze', 'POST', JSON.stringify({}), jsonHeaders);
      expect(enrich).not.toHaveBeenCalled();
      expect(scoreFn).not.toHaveBeenCalled();
    });
  });

  describe('successful SSE stream', () => {
    it('streams status, sel_result and cml_result as SSE and terminates with [DONE]', async () => {
      const { pipeline } = makePipeline(LOW_SCORE);
      currentPipeline = pipeline;

      const res = await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ title: 'ship it', description: 'do the thing', labels: ['a'] }),
        jsonHeaders
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache');

      const { events, done } = parseSSE(res.body);
      expect(done).toBe(true);

      const sel = events.find((e) => e.type === 'sel_result');
      expect(sel?.data).toMatchObject({ intent: 'add feature', summary: 'a summary' });

      const cml = events.find((e) => e.type === 'cml_result');
      expect(cml?.data).toMatchObject({
        overall: LOW_SCORE.overall,
        riskLevel: LOW_SCORE.riskLevel,
        recommendedRoute: 'local',
      });

      // At least one status event announces each pipeline stage before results.
      expect(events.filter((e) => e.type === 'status').length).toBeGreaterThanOrEqual(2);
    });

    it('forwards the validated request through to pipeline.enrich as a raw work item', async () => {
      const { pipeline, enrich } = makePipeline(LOW_SCORE);
      currentPipeline = pipeline;

      await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ title: 'my title', description: 'my desc', labels: ['bug', 'p1'] }),
        jsonHeaders
      );

      expect(enrich).toHaveBeenCalledTimes(1);
      expect(enrich.mock.calls[0]?.[0]).toMatchObject({
        title: 'my title',
        description: 'my desc',
        labels: ['bug', 'p1'],
        source: 'manual',
      });
    });

    it('defaults optional description/labels before conversion to a work item', async () => {
      const { pipeline, enrich } = makePipeline(LOW_SCORE);
      currentPipeline = pipeline;

      await request('/api/analyze', 'POST', JSON.stringify({ title: 'only title' }), jsonHeaders);

      // The route substitutes '' for a missing description before conversion,
      // so the raw work item carries an empty string (not null).
      expect(enrich.mock.calls[0]?.[0]).toMatchObject({
        title: 'only title',
        description: '',
        labels: [],
      });
    });

    it('does not emit a signals event when the score trips no concern thresholds', async () => {
      const { pipeline } = makePipeline(LOW_SCORE);
      currentPipeline = pipeline;

      const res = await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ title: 'calm change' }),
        jsonHeaders
      );
      const { events } = parseSSE(res.body);
      expect(events.some((e) => e.type === 'signals')).toBe(false);
    });

    it('does not run the simulation stage for a non simulation-required route', async () => {
      const { pipeline, simulate } = makePipeline(LOW_SCORE);
      currentPipeline = pipeline;

      const res = await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ title: 'x' }),
        jsonHeaders
      );
      const { events } = parseSSE(res.body);
      expect(simulate).not.toHaveBeenCalled();
      expect(events.some((e) => e.type === 'pesl_result')).toBe(false);
    });
  });

  describe('high-complexity / simulation-required stream', () => {
    it('runs simulation and emits a pesl_result plus concern signals', async () => {
      const { pipeline, simulate } = makePipeline(HIGH_SCORE);
      currentPipeline = pipeline;

      const res = await request(
        '/api/analyze',
        'POST',
        JSON.stringify({ title: 'risky change' }),
        jsonHeaders
      );
      const { events, done } = parseSSE(res.body);

      expect(res.status).toBe(200);
      expect(done).toBe(true);

      // simulate() is called with (spec, score, 'guided-change').
      expect(simulate).toHaveBeenCalledTimes(1);
      expect(simulate.mock.calls[0]?.[2]).toBe('guided-change');

      const pesl = events.find((e) => e.type === 'pesl_result');
      expect(pesl?.data).toMatchObject(FAKE_SIM);

      // HIGH_SCORE trips all three scoreToConcernSignals thresholds.
      const signals = events.find((e) => e.type === 'signals');
      expect(Array.isArray(signals?.data)).toBe(true);
      const names = (signals?.data as Array<{ name: string }>).map((s) => s.name);
      expect(names).toEqual(
        expect.arrayContaining(['highComplexity', 'largeBlastRadius', 'highAmbiguity'])
      );
    });
  });
});
