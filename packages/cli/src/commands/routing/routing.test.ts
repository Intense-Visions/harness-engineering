import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createConfigCommand } from './config';
import { createTraceCommand } from './trace';
import { createDecisionsCommand } from './decisions';
import { createTelemetryCommand } from './telemetry';
import { createStatusCommand } from './status';

/**
 * Spec B Phase 6: pins Observable Truths 1, 2, 3, 4, 5, 7, 8 for the
 * `harness routing config|trace|decisions` subcommands. Mocks `fetch`
 * via `vi.spyOn(globalThis, 'fetch')`; captures stdout/stderr via spies
 * on `console.log` / `console.error`; intercepts `process.exit` so the
 * test runner does not actually exit.
 */

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_BASE = process.env['HARNESS_ORCHESTRATOR_URL'];
const ORIGINAL_TOKEN = process.env['HARNESS_API_TOKEN'];

interface FetchCall {
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): {
  fetchSpy: ReturnType<typeof vi.fn>;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchSpy = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const u = String(url);
    const i = init ?? {};
    calls.push({ url: u, init: i });
    return handler(u, i);
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  return { fetchSpy, calls };
}

function mockFetchThrow(error: Error): { fetchSpy: ReturnType<typeof vi.fn>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchSpy = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    throw error;
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  return { fetchSpy, calls };
}

describe('harness routing — subcommand acceptance contracts (Spec B Phase 6)', () => {
  // Use any-typed handles for the spies so .mock.calls is treated as
  // unknown[][]; we always coerce captured args to strings when reading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let errSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    process.env['HARNESS_ORCHESTRATOR_URL'] = 'http://127.0.0.1:9999';
    delete process.env['HARNESS_API_TOKEN'];
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number) => undefined) as never);
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_BASE === undefined) delete process.env['HARNESS_ORCHESTRATOR_URL'];
    else process.env['HARNESS_ORCHESTRATOR_URL'] = ORIGINAL_BASE;
    if (ORIGINAL_TOKEN === undefined) delete process.env['HARNESS_API_TOKEN'];
    else process.env['HARNESS_API_TOKEN'] = ORIGINAL_TOKEN;
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // trace: happy path (Observable Truth 1 / F7)
  // -------------------------------------------------------------------------
  it('trace --skill happy path: POSTs use case and prints backend + resolution path', async () => {
    const body = {
      decision: {
        backendName: 'local-fast',
        backendType: 'local',
        useCase: { kind: 'skill', skillName: 'harness-debugging' },
        resolutionPath: [{ source: 'skill', candidate: 'local-fast', outcome: 'chosen' }],
        timestamp: '2026-05-26T00:00:00Z',
        durationMs: 0.5,
      },
      def: { type: 'local' },
    };
    const { calls } = mockFetch(() => new Response(JSON.stringify(body), { status: 200 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(['--skill', 'harness-debugging'], { from: 'user' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://127.0.0.1:9999/api/v1/routing/trace');
    expect(calls[0]!.init.method).toBe('POST');
    const rawBody = calls[0]!.init.body;
    const reqBody = JSON.parse(typeof rawBody === 'string' ? rawBody : '');
    expect(reqBody).toEqual({
      useCase: { kind: 'skill', skillName: 'harness-debugging' },
    });
    // Did not call process.exit with non-zero
    const nonZeroExits = exitSpy.mock.calls.filter((c: unknown[]) => c[0] !== 0);
    expect(nonZeroExits).toHaveLength(0);

    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/local-fast/);
    expect(allLog.toLowerCase()).toMatch(/resolution/);
  });

  // -------------------------------------------------------------------------
  // trace --json (Observable Truth 2)
  // -------------------------------------------------------------------------
  it('trace --json: prints pretty JSON of {decision, def}', async () => {
    const body = {
      decision: {
        backendName: 'local-fast',
        backendType: 'local',
        useCase: { kind: 'skill', skillName: 'harness-debugging' },
        resolutionPath: [{ source: 'skill', candidate: 'local-fast', outcome: 'chosen' }],
        timestamp: '2026-05-26T00:00:00Z',
        durationMs: 0.5,
      },
      def: { type: 'local' },
    };
    mockFetch(() => new Response(JSON.stringify(body), { status: 200 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(['--skill', 'harness-debugging', '--json'], { from: 'user' });

    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/"backendName": "local-fast"/);
    // jq-pipable: single top-level object
    expect(allLog.trim().startsWith('{')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // trace 500 -> exit 2 (Observable Truth 3 / O3)
  // -------------------------------------------------------------------------
  it('trace 500: prints error body to stderr and exits ExitCode.ERROR (2)', async () => {
    mockFetch(() => new Response('routing.default produced no available backend', { status: 500 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(['--skill', 'harness-debugging'], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    const allErr = errSpy.mock.calls.map((c: unknown[]) => String(c[1] ?? c[0])).join('\n');
    expect(allErr).toMatch(/routing\.default produced no available backend/);
  });

  // -------------------------------------------------------------------------
  // trace --complexity/--risk (AMR Phase 3 / SC10)
  // -------------------------------------------------------------------------
  it('trace --complexity/--risk: POSTs synthetic verdict and prints tier + est cost', async () => {
    const body = {
      decision: {
        backendName: 'strong',
        backendType: 'anthropic',
        useCase: { kind: 'skill', skillName: 'harness-debugging' },
        resolutionPath: [{ source: 'skill', candidate: 'strong', outcome: 'chosen' }],
        timestamp: '2026-07-11T00:00:00Z',
        durationMs: 0.5,
      },
      def: { type: 'anthropic' },
      tierRequired: 'strong',
      estCostUsd: 0.024,
    };
    const { calls } = mockFetch(() => new Response(JSON.stringify(body), { status: 200 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(
      ['--skill', 'harness-debugging', '--complexity', 'complex', '--risk', 'high'],
      { from: 'user' }
    );

    expect(calls).toHaveLength(1);
    const reqBody = JSON.parse(
      typeof calls[0]!.init.body === 'string' ? (calls[0]!.init.body as string) : ''
    );
    expect(reqBody).toEqual({
      useCase: { kind: 'skill', skillName: 'harness-debugging' },
      complexity: 'complex',
      risk: 'high',
    });

    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/Tier required: strong/);
    expect(allLog).toMatch(/Est cost: \$0\.0240/);
  });

  it('trace WITHOUT --complexity/--risk: omits those flags AND the tier/cost lines', async () => {
    const body = {
      decision: {
        backendName: 'local-fast',
        backendType: 'local',
        useCase: { kind: 'skill', skillName: 'harness-debugging' },
        resolutionPath: [{ source: 'skill', candidate: 'local-fast', outcome: 'chosen' }],
        timestamp: '2026-07-11T00:00:00Z',
        durationMs: 0.5,
      },
      def: { type: 'local' },
    };
    const { calls } = mockFetch(() => new Response(JSON.stringify(body), { status: 200 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(['--skill', 'harness-debugging'], { from: 'user' });

    const reqBody = JSON.parse(
      typeof calls[0]!.init.body === 'string' ? (calls[0]!.init.body as string) : ''
    );
    expect(reqBody).toEqual({ useCase: { kind: 'skill', skillName: 'harness-debugging' } });

    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).not.toMatch(/Tier required/);
    expect(allLog).not.toMatch(/Est cost/);
  });

  // -------------------------------------------------------------------------
  // trace client-side enum validation (fail fast, no server round-trip)
  // -------------------------------------------------------------------------
  it('trace --complexity <bad>: fails fast with allowed-values error and never calls fetch', async () => {
    const { calls } = mockFetch(() => new Response('{}', { status: 200 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(['--skill', 'x', '--complexity', 'nonsense'], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(calls).toHaveLength(0); // never round-tripped to the server
    const allErr = errSpy.mock.calls.map((c: unknown[]) => String(c[1] ?? c[0])).join('\n');
    expect(allErr).toMatch(/Invalid --complexity "nonsense"/);
    expect(allErr).toMatch(/trivial, simple, moderate, complex/);
  });

  it('trace --risk <bad>: fails fast with allowed-values error and never calls fetch', async () => {
    const { calls } = mockFetch(() => new Response('{}', { status: 200 }));

    const cmd = createTraceCommand();
    await cmd.parseAsync(['--skill', 'x', '--risk', 'medium'], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(calls).toHaveLength(0);
    const allErr = errSpy.mock.calls.map((c: unknown[]) => String(c[1] ?? c[0])).join('\n');
    expect(allErr).toMatch(/Invalid --risk "medium"/);
    expect(allErr).toMatch(/low, high/);
  });

  // -------------------------------------------------------------------------
  // decisions filters + --last (Observable Truth 4 / F8)
  // -------------------------------------------------------------------------
  it('decisions --skill X --last 3: passes filter + limit query params and prints table', async () => {
    const decisions = [
      {
        backendName: 'cloud',
        backendType: 'anthropic',
        useCase: { kind: 'skill', skillName: 'X' },
        resolutionPath: [],
        timestamp: '2026-05-26T12:00:02Z',
        durationMs: 1.0,
      },
      {
        backendName: 'local-fast',
        backendType: 'local',
        useCase: { kind: 'skill', skillName: 'X' },
        resolutionPath: [],
        timestamp: '2026-05-26T12:00:01Z',
        durationMs: 0.8,
      },
      {
        backendName: 'cloud',
        backendType: 'anthropic',
        useCase: { kind: 'skill', skillName: 'X' },
        resolutionPath: [],
        timestamp: '2026-05-26T12:00:00Z',
        durationMs: 1.2,
      },
    ];
    const { calls } = mockFetch(() => new Response(JSON.stringify({ decisions }), { status: 200 }));

    const cmd = createDecisionsCommand();
    await cmd.parseAsync(['--skill', 'X', '--last', '3'], { from: 'user' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/api/v1/routing/decisions');
    expect(calls[0]!.url).toContain('skill=X');
    expect(calls[0]!.url).toContain('limit=3');

    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/cloud/);
    expect(allLog).toMatch(/local-fast/);
  });

  // -------------------------------------------------------------------------
  // decisions --json (Observable Truth 5)
  // -------------------------------------------------------------------------
  it('decisions --json: emits pretty JSON of {decisions}', async () => {
    const decisions = [
      {
        backendName: 'cloud',
        backendType: 'anthropic',
        useCase: { kind: 'skill', skillName: 'X' },
        resolutionPath: [],
        timestamp: '2026-05-26T12:00:00Z',
        durationMs: 1.0,
      },
    ];
    mockFetch(() => new Response(JSON.stringify({ decisions }), { status: 200 }));

    const cmd = createDecisionsCommand();
    await cmd.parseAsync(['--json'], { from: 'user' });

    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/"decisions"/);
  });

  // -------------------------------------------------------------------------
  // network failure -> exit 2 (Observable Truth 7) — exercises decisions path
  // -------------------------------------------------------------------------
  it('decisions: network failure prints "Failed to reach orchestrator" and exits 2', async () => {
    mockFetchThrow(new Error('ECONNREFUSED'));

    const cmd = createDecisionsCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    const allErr = errSpy.mock.calls.map((c: unknown[]) => String(c[1] ?? c[0])).join('\n');
    expect(allErr).toMatch(/Failed to reach orchestrator/);
    expect(allErr).toMatch(/ECONNREFUSED/);
  });

  // -------------------------------------------------------------------------
  // 503 path (Observable Truth 8) — exercises config path
  // -------------------------------------------------------------------------
  it('config 503: prints "Routing observability not available" and exits 2', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ error: 'BackendRouter not available' }), {
          status: 503,
        })
    );

    const cmd = createConfigCommand();
    await cmd.parseAsync([], { from: 'user' });

    expect(exitSpy).toHaveBeenCalledWith(2);
    const allErr = errSpy.mock.calls.map((c: unknown[]) => String(c[1] ?? c[0])).join('\n');
    expect(allErr).toMatch(/Routing observability not available/);
  });

  // -------------------------------------------------------------------------
  // AMR observability: telemetry + status commands
  // -------------------------------------------------------------------------
  it('telemetry: renders tier distribution + per-decision cost from /routing/telemetry', async () => {
    const telemetry = {
      spentUsd: 0.6,
      decisions: [
        {
          decisionTs: '2026-07-12T12:00:00.000Z',
          tierRequired: 'strong',
          backend: 'cloud',
          estCostUsd: 0.4,
        },
        {
          decisionTs: '2026-07-12T12:00:01.000Z',
          tierRequired: 'fast',
          backend: 'local',
          estCostUsd: 0.2,
        },
      ],
    };
    const { calls } = mockFetch(() => new Response(JSON.stringify(telemetry), { status: 200 }));
    await createTelemetryCommand().parseAsync([], { from: 'user' });
    expect(calls[0]!.url).toContain('/api/v1/routing/telemetry');
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/Ring spend total:\s+\$0\.6000/);
    expect(allLog).toMatch(/strong/);
    expect(allLog).toMatch(/cloud/);
    expect(allLog).toMatch(/\$0\.4000/);
  });

  it('telemetry --json: emits the raw payload', async () => {
    mockFetch(() => new Response(JSON.stringify({ decisions: [], spentUsd: 0 }), { status: 200 }));
    await createTelemetryCommand().parseAsync(['--json'], { from: 'user' });
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/"spentUsd"/);
  });

  it('telemetry --last bounds only the per-decision table; distribution summarizes the full ring', async () => {
    const telemetry = {
      spentUsd: 1.0,
      decisions: [
        {
          decisionTs: '2026-07-12T12:00:00.000Z',
          tierRequired: 'strong',
          backend: 'a',
          estCostUsd: 0.5,
        },
        {
          decisionTs: '2026-07-12T12:00:01.000Z',
          tierRequired: 'strong',
          backend: 'b',
          estCostUsd: 0.3,
        },
        {
          decisionTs: '2026-07-12T12:00:02.000Z',
          tierRequired: 'fast',
          backend: 'c',
          estCostUsd: 0.2,
        },
      ],
    };
    mockFetch(() => new Response(JSON.stringify(telemetry), { status: 200 }));
    await createTelemetryCommand().parseAsync(['--last', '1'], { from: 'user' });
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    // Distribution reflects the full ring (3 decisions), not the limited table.
    expect(allLog).toMatch(/Decisions \(retained ring\): 3/);
    expect(allLog).toMatch(/strong\s+2/); // 2 strong across the full ring
    // The per-decision table is limited to the latest 1 and says so.
    expect(allLog).toMatch(/latest 1 of 3/);
    // Only backend 'a' (first row) shows in the table; 'b'/'c' are omitted.
    expect(allLog).toMatch(/ a /);
    expect(allLog).not.toMatch(/ c /);
  });

  it('status: renders the budget bar + escalation + allowlist from /routing/status', async () => {
    const status = {
      active: true,
      budget: {
        spentUsd: 80,
        capUsd: 100,
        degradeAtPct: 50,
        spentPct: 80,
        degrading: true,
        exhausted: false,
      },
      escalation: [{ coherenceUnit: 'issue-7', floor: 'strong' }],
      allowedProviders: ['local'],
    };
    const { calls } = mockFetch(() => new Response(JSON.stringify(status), { status: 200 }));
    await createStatusCommand().parseAsync([], { from: 'user' });
    expect(calls[0]!.url).toContain('/api/v1/routing/status');
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/Adaptive routing: ON/);
    expect(allLog).toMatch(/\$80\.0000 \/ \$100\.00/);
    expect(allLog).toMatch(/DEGRADING/);
    expect(allLog).toMatch(/issue-7/);
    expect(allLog).toMatch(/local/);
  });

  it('status: renders EXHAUSTED (hard cap) over DEGRADING once spend crosses the cap', async () => {
    const status = {
      active: true,
      budget: {
        spentUsd: 120,
        capUsd: 100,
        degradeAtPct: 50,
        spentPct: 120,
        degrading: true,
        exhausted: true,
      },
      escalation: [],
      allowedProviders: null,
    };
    mockFetch(() => new Response(JSON.stringify(status), { status: 200 }));
    await createStatusCommand().parseAsync([], { from: 'user' });
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/EXHAUSTED/);
    expect(allLog).not.toMatch(/DEGRADING/); // exhausted supersedes the degrade label
  });

  it('status: renders OFF when routing is inactive', async () => {
    const status = { active: false, budget: null, escalation: [], allowedProviders: null };
    mockFetch(() => new Response(JSON.stringify(status), { status: 200 }));
    await createStatusCommand().parseAsync([], { from: 'user' });
    const allLog = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLog).toMatch(/Adaptive routing: OFF/);
  });
});
