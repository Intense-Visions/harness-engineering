import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { RoutingDecision } from '@harness-engineering/types';
import { Routing } from '../../../src/client/pages/Routing';

const mkDecision = (overrides: Partial<RoutingDecision> = {}): RoutingDecision => ({
  timestamp: new Date().toISOString(),
  useCase: { kind: 'skill', skillName: 'harness-debugging' },
  resolutionPath: [
    { source: 'skill', candidate: 'claude-opus', outcome: 'unknown-backend' },
    { source: 'default', candidate: 'claude-opus', outcome: 'chosen' },
  ],
  backendName: 'claude-opus',
  backendType: 'anthropic',
  durationMs: 2,
  ...overrides,
});

class FakeWS {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = FakeWS.CLOSED;
    this.onclose?.({});
  });
}
let lastWS: FakeWS | null = null;

function setupFetchMock(initialDecisions: RoutingDecision[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/v1/routing/config')) {
      return new Response(
        JSON.stringify({
          routing: { default: 'claude-opus' },
          resolvedChains: {
            'skill:harness-debugging': [{ candidate: 'claude-opus', exists: true }],
            default: [{ candidate: 'claude-opus', exists: true }],
          },
          backends: ['claude-opus', 'gemini-pro'],
        }),
        { status: 200 }
      );
    }
    if (url.startsWith('/api/v1/routing/decisions')) {
      return new Response(JSON.stringify({ decisions: initialDecisions }), { status: 200 });
    }
    if (url.endsWith('/api/v1/routing/trace') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          decision: mkDecision({ backendName: 'traced-backend' }),
          def: { type: 'anthropic' },
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 200 });
  });
}

beforeEach(() => {
  lastWS = null;
  const WSCtor = function WSCtor(this: FakeWS) {
    const ws = new FakeWS();
    lastWS = ws;
    queueMicrotask(() => {
      ws.readyState = FakeWS.OPEN;
      ws.onopen?.({});
    });
    return ws;
  } as unknown as typeof WebSocket;
  vi.stubGlobal('WebSocket', WSCtor);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Routing page (end-to-end)', () => {
  it('renders all four cards once config + decisions resolve (Truth 1, F9)', async () => {
    setupFetchMock([mkDecision()]);
    render(<Routing />);
    await waitFor(() => expect(screen.getByTestId('routing-card-chains')).toBeDefined());
    expect(screen.getByTestId('routing-card-decisions')).toBeDefined();
    expect(screen.getByTestId('routing-card-volume')).toBeDefined();
    expect(screen.getByTestId('routing-card-trace')).toBeDefined();
  });

  it('prepends a WS-delivered decision to the decisions card AND increments volume count (Truth 2)', async () => {
    setupFetchMock([mkDecision({ backendName: 'claude-opus' })]);
    render(<Routing />);
    await waitFor(() => expect(screen.getByTestId('routing-card-decisions')).toBeDefined());
    await waitFor(() => expect(lastWS).not.toBeNull());

    act(() => {
      lastWS!.onmessage?.({
        data: JSON.stringify({
          type: 'routing:decision',
          data: mkDecision({ backendName: 'gemini-pro' }),
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('volume-count-gemini-pro').textContent).toBe('1');
    });
    expect(screen.getByTestId('volume-count-claude-opus').textContent).toBe('1');
  });

  it('expands a decision row on click and renders the resolutionPath (Truth 3)', async () => {
    setupFetchMock([mkDecision({ backendName: 'claude-opus' })]);
    render(<Routing />);
    await waitFor(() => expect(screen.getByTestId('decision-row-0')).toBeDefined());
    fireEvent.click(screen.getByTestId('decision-row-0'));
    const expanded = await screen.findByTestId('decision-row-0-expanded');
    expect(expanded.textContent).toContain('chosen');
  });

  it('submits the trace form and renders trace-backend (Truth 4)', async () => {
    setupFetchMock([]);
    render(<Routing />);
    await waitFor(() => expect(screen.getByTestId('routing-card-trace')).toBeDefined());

    fireEvent.change(screen.getByRole('textbox', { name: /skill/i }), {
      target: { value: 'harness-debugging' },
    });
    fireEvent.click(screen.getByRole('button', { name: /trace/i }));

    await waitFor(() =>
      expect(screen.getByTestId('trace-backend').textContent).toContain('traced-backend')
    );

    // Verify the POST shape.
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const traceCall = calls.find((c: unknown[]) => String(c[0]).endsWith('/api/v1/routing/trace'));
    expect(traceCall).toBeDefined();
    const init = traceCall![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      useCase: { kind: 'skill', skillName: 'harness-debugging' },
    });
  });
});
