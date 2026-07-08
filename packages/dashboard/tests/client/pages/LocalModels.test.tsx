import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LocalModels } from '../../../src/client/pages/LocalModels';

class FakeWebSocket {
  static instance: FakeWebSocket | null = null;
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instance = this;
    setTimeout(() => this.onopen?.(), 0);
  }
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const HARDWARE = {
  platform: 'macos',
  vramGb: 36,
  ramGb: 36,
  bandwidthGbps: 400,
  cpuName: 'Apple M3 Max',
  detectedAt: '2026-07-01T00:00:00.000Z',
};

function poolWith(entries: unknown[], diskUsedGb = 0): unknown {
  return {
    diskBudgetGb: 100,
    diskUsedGb,
    entries,
    allowedOrgs: ['Qwen'],
    allowedFamilies: [],
    lastRefreshAt: null,
  };
}

const ENTRY = {
  ollamaName: 'qwen3:32b',
  hfRepoId: 'Qwen/Qwen3-32B-GGUF',
  sizeOnDiskGb: 18,
  installedAt: '2026-07-01T00:00:00.000Z',
  lastUsedAt: null,
  currentScore: 82,
};

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Handlers = Partial<
  Record<'hardware' | 'pool' | 'recommendations' | 'proposals', () => Response>
>;

function installFetch(h: Handlers): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/local-models/hardware'))
      return Promise.resolve((h.hardware ?? (() => res(HARDWARE)))());
    if (url.includes('/local-models/pool'))
      return Promise.resolve((h.pool ?? (() => res(poolWith([]))))());
    if (url.includes('/local-models/recommendations'))
      return Promise.resolve((h.recommendations ?? (() => res([])))());
    if (url.includes('/local-models/proposals'))
      return Promise.resolve((h.proposals ?? (() => res([])))());
    return Promise.resolve(res({}, 200));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const disabled = () => res({ error: 'LMLM disabled' }, 503);

beforeEach(() => {
  FakeWebSocket.instance = null;
  vi.stubGlobal('WebSocket', FakeWebSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LocalModels page — O3 empty/degraded coverage', () => {
  it('Fixture A — empty pool: renders panel with empty pool + no-recs states', async () => {
    installFetch({ pool: () => res(poolWith([])) });
    render(<LocalModels />);

    await waitFor(() => expect(screen.getByTestId('local-models-page')).toBeDefined());
    await waitFor(() => {
      expect(screen.getByTestId('pool-card').textContent).toMatch(/no models in the pool/i);
      expect(screen.getByTestId('rec-empty').textContent).toMatch(/no recommendations yet/i);
    });
  });

  it('Fixture B — HF unreachable: recommendations 503 → empty state, rest renders', async () => {
    installFetch({ pool: () => res(poolWith([ENTRY], 18)), recommendations: disabled });
    render(<LocalModels />);

    await waitFor(() => {
      expect(screen.getByTestId('rec-empty')).toBeDefined();
      expect(screen.getByTestId('hw-platform')).toBeDefined();
      expect(screen.getByTestId('pool-row-qwen3:32b')).toBeDefined();
    });
  });

  it('Fixture C — no hardware detected: hardware 503 → "No hardware detected", rest renders', async () => {
    installFetch({ hardware: disabled, pool: () => res(poolWith([ENTRY], 18)) });
    render(<LocalModels />);

    await waitFor(() => {
      expect(screen.getByTestId('hw-card').textContent).toMatch(/LMLM disabled|no hardware/i);
      expect(screen.getByTestId('pool-row-qwen3:32b')).toBeDefined();
    });
  });

  it('All-disabled — all four 503 → single "LMLM disabled" state (Truth 8)', async () => {
    installFetch({
      hardware: disabled,
      pool: disabled,
      recommendations: disabled,
      proposals: disabled,
    });
    render(<LocalModels />);

    await waitFor(() => {
      expect(screen.getByTestId('lmlm-disabled').textContent).toMatch(/LMLM disabled/i);
    });
    // The three cards are NOT rendered in the all-disabled state.
    expect(screen.queryByTestId('pool-card')).toBeNull();
    expect(screen.queryByTestId('hw-card')).toBeNull();
  });

  it('Live update — local-models:pool frame refetches the pool', async () => {
    const fetchMock = installFetch({ pool: () => res(poolWith([ENTRY], 18)) });
    render(<LocalModels />);

    await waitFor(() => expect(screen.getByTestId('pool-row-qwen3:32b')).toBeDefined());
    await waitFor(() => expect(FakeWebSocket.instance).not.toBeNull());

    const poolBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/local-models/pool')
    ).length;

    act(() => {
      FakeWebSocket.instance!.simulateMessage({
        type: 'local-models:pool',
        data: { action: 'evict', phase: 'evict_completed' },
      });
    });

    await waitFor(() => {
      const poolAfter = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/local-models/pool')
      ).length;
      expect(poolAfter).toBe(poolBefore + 1);
    });
  });
});
