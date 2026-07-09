import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PoolCard } from '../../../../src/client/components/local-models/PoolCard';
import type { DashPoolStateView } from '../../../../src/client/types/local-models';

const POOL: DashPoolStateView = {
  diskBudgetGb: 100,
  diskUsedGb: 40,
  entries: [
    {
      ollamaName: 'qwen3:32b',
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      sizeOnDiskGb: 18,
      installedAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      currentScore: 82,
    },
    {
      ollamaName: 'llama3:8b',
      hfRepoId: 'meta/Llama-3-8B-GGUF',
      sizeOnDiskGb: 22,
      installedAt: '2026-07-02T00:00:00.000Z',
      lastUsedAt: '2026-07-05T00:00:00.000Z',
      currentScore: 70,
      pendingEviction: true,
    },
  ],
  allowedOrgs: ['Qwen', 'meta'],
  allowedFamilies: [],
  lastRefreshAt: null,
};

function jsonRes(status: number, body: unknown): Response {
  return { ok: status < 400, status, text: async () => '', json: async () => body } as Response;
}

function renderPool(over: Partial<React.ComponentProps<typeof PoolCard>> = {}) {
  const onMutated = over.onMutated ?? vi.fn();
  render(<PoolCard pool={POOL} error={null} loading={false} onMutated={onMutated} {...over} />);
  return { onMutated };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PoolCard', () => {
  it('renders one row per entry with its fields', () => {
    renderPool();
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('qwen3:32b');
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('Qwen/Qwen3-32B-GGUF');
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('18');
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('82');
    expect(screen.getByTestId('pool-row-llama3:8b')).toBeDefined();
  });

  it('renders a disk-usage indicator with used vs budget', () => {
    renderPool();
    expect(screen.getByTestId('pool-disk').textContent).toContain('40');
    expect(screen.getByTestId('pool-disk').textContent).toContain('100');
  });

  it('rounds raw float sizes/scores so they never leak into the DOM', () => {
    renderPool({
      pool: {
        ...POOL,
        diskUsedGb: 75.65831765532494,
        entries: [
          {
            ollamaName: 'deepseek-r1:32b',
            hfRepoId: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B-GGUF',
            sizeOnDiskGb: 18.067657947540283,
            installedAt: '2026-07-01T00:00:00.000Z',
            lastUsedAt: null,
            currentScore: 57.629999999999995,
          },
        ],
      },
    });
    const disk = screen.getByTestId('pool-disk').textContent ?? '';
    const row = screen.getByTestId('pool-row-deepseek-r1:32b').textContent ?? '';
    expect(disk).toContain('75.7'); // one decimal, not 75.65831765532494
    expect(row).toContain('18.1 GB'); // size to one decimal
    expect(row).toContain('score 58'); // absolute score as a whole number
    // No long float anywhere on the card.
    expect(disk).not.toMatch(/\d\.\d{3,}/);
    expect(row).not.toMatch(/\d\.\d{3,}/);
  });

  it('renders a pending-eviction badge for entries flagged pendingEviction', () => {
    renderPool();
    expect(screen.getByTestId('pool-pending-llama3:8b')).toBeDefined();
    expect(screen.queryByTestId('pool-pending-qwen3:32b')).toBeNull();
  });

  it('[O3] renders "No models in the pool" for an empty pool — no throw', () => {
    renderPool({ pool: { ...POOL, entries: [], diskUsedGb: 0 } });
    expect(screen.getByTestId('pool-card').textContent).toMatch(/no models in the pool/i);
  });

  it('renders the disabled state when LMLM is disabled', () => {
    render(<PoolCard pool={null} error="LMLM disabled" loading={false} onMutated={vi.fn()} />);
    expect(screen.getByTestId('pool-card').textContent).toMatch(/LMLM disabled/i);
  });

  it('Remove POSTs to /pool/remove and calls onMutated (SC7)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonRes(200, { disposition: 'removed' })));
    vi.stubGlobal('fetch', fetchMock);
    const { onMutated } = renderPool();

    fireEvent.click(screen.getByTestId('pool-remove-qwen3:32b'));

    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('/api/v1/local-models/pool/remove');
    expect((init as RequestInit).method).toBe('POST');
    expect(String((init as RequestInit).body)).toContain('qwen3:32b');
  });

  it('a deferred (202) remove renders "removes after current run" (SC7)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonRes(202, { disposition: 'deferred' })));
    vi.stubGlobal('fetch', fetchMock);
    const { onMutated } = renderPool();

    fireEvent.click(screen.getByTestId('pool-remove-qwen3:32b'));

    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('pool-note-qwen3:32b').textContent).toMatch(
      /after the current run|current run/i
    );
  });

  it('disables Remove for a member already pending eviction', () => {
    renderPool();
    expect((screen.getByTestId('pool-remove-llama3:8b') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('pool-remove-qwen3:32b') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a failed remove surfaces an inline error and does not call onMutated', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 409, text: async () => 'conflict' } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const { onMutated } = renderPool();

    fireEvent.click(screen.getByTestId('pool-remove-qwen3:32b'));

    await waitFor(() => expect(screen.getByTestId('pool-error-qwen3:32b')).toBeDefined());
    expect(onMutated).not.toHaveBeenCalled();
  });
});
