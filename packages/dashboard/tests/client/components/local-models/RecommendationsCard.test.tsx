import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import { RecommendationsCard } from '../../../../src/client/components/local-models/RecommendationsCard';
import type { DashRankedModel, DashPoolStateView } from '../../../../src/client/types/local-models';

const POOL_WITH_QWEN: DashPoolStateView = {
  diskBudgetGb: 100,
  diskUsedGb: 18,
  entries: [
    {
      ollamaName: 'qwen3:32b',
      hfRepoId: 'Qwen/Qwen3-32B-GGUF',
      sizeOnDiskGb: 18,
      installedAt: '2026-07-01T00:00:00.000Z',
      lastUsedAt: null,
      currentScore: 82,
    },
  ],
  allowedOrgs: ['Qwen'],
  allowedFamilies: [],
  lastRefreshAt: null,
};

const RECS: DashRankedModel[] = [
  {
    hfRepoId: 'Qwen/Qwen3-32B-GGUF',
    sizeB: 32,
    quant: 'Q4_K_M',
    estimatedVramGb: 20,
    estimatedTokPerSec: 30,
    speedConfidence: 'medium',
    score: 82,
    evidence: 'direct',
    benchmarkSnapshot: '2026-05-21',
    fitsHardware: true,
  },
];

const PROPOSAL: ModelProposalRecord = {
  kind: 'model',
  id: 'mp-1',
  createdAt: '2026-07-06T00:00:00.000Z',
  proposedBy: 'refresh-scheduler',
  source: { justification: 'A newer model scores materially higher on the coding suite.' },
  model: {
    action: 'add',
    target: { hfRepoId: 'Qwen/Qwen3-32B-GGUF', ollamaName: 'qwen3:32b' },
    scoreDelta: 12,
    justification: {
      summary: 'Qwen3-32B beats the incumbent by 12 points',
      benchmarkBasis: ['livebench-2026-05'],
      hardwareFit: 'fits in 36GB unified memory',
      evidence: 'direct',
      freshness: 'snapshot 2026-05-21',
    },
    diskImpactGb: 18,
  },
  status: 'open',
};

function okRes(): Response {
  return { ok: true, status: 200, text: async () => 'ok' } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecommendationsCard', () => {
  it('renders ranked recommendation rows', () => {
    render(
      <RecommendationsCard
        recommendations={RECS}
        recommendationsError={null}
        proposals={[]}
        onDecided={() => {}}
        loading={false}
      />
    );
    const row = screen.getByTestId('rec-row-Qwen/Qwen3-32B-GGUF');
    expect(row.textContent).toContain('Qwen/Qwen3-32B-GGUF');
    expect(row.textContent).toContain('82');
    expect(row.textContent).toContain('direct');
    expect(row.textContent).toContain('20');
  });

  it('Install POSTs to /pool/install with hfRepoId + quant and calls onDecided (SC6)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okRes()));
    vi.stubGlobal('fetch', fetchMock);
    const onDecided = vi.fn();
    render(
      <RecommendationsCard
        recommendations={RECS}
        recommendationsError={null}
        proposals={[]}
        pool={null}
        onDecided={onDecided}
        loading={false}
      />
    );
    fireEvent.click(screen.getByTestId('rec-install-Qwen/Qwen3-32B-GGUF'));

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('/api/v1/local-models/pool/install');
    expect((init as RequestInit).method).toBe('POST');
    expect(String((init as RequestInit).body)).toContain('Qwen/Qwen3-32B-GGUF');
    expect(String((init as RequestInit).body)).toContain('Q4_K_M');
    vi.unstubAllGlobals();
  });

  it('shows "installed" instead of an Install button for a pooled model (SC6)', () => {
    render(
      <RecommendationsCard
        recommendations={RECS}
        recommendationsError={null}
        proposals={[]}
        pool={POOL_WITH_QWEN}
        onDecided={vi.fn()}
        loading={false}
      />
    );
    expect(screen.getByTestId('rec-installed-Qwen/Qwen3-32B-GGUF')).toBeDefined();
    expect(screen.queryByTestId('rec-install-Qwen/Qwen3-32B-GGUF')).toBeNull();
  });

  it('a failed install surfaces an inline error and does not call onDecided', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 409, text: async () => 'budget_exceeded' } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDecided = vi.fn();
    render(
      <RecommendationsCard
        recommendations={RECS}
        recommendationsError={null}
        proposals={[]}
        pool={null}
        onDecided={onDecided}
        loading={false}
      />
    );
    fireEvent.click(screen.getByTestId('rec-install-Qwen/Qwen3-32B-GGUF'));

    await waitFor(() => expect(screen.getByTestId('rec-error-Qwen/Qwen3-32B-GGUF')).toBeDefined());
    expect(onDecided).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rounds long float metrics for display (score → whole, GB/tok-s → 1 decimal)', () => {
    const noisy: DashRankedModel[] = [
      {
        ...RECS[0]!,
        estimatedVramGb: 44.15923222899437,
        estimatedTokPerSec: 1.7711205344329897,
        score: 57.629999999999995,
      },
    ];
    render(
      <RecommendationsCard
        recommendations={noisy}
        recommendationsError={null}
        proposals={[]}
        onDecided={() => {}}
        loading={false}
      />
    );
    const row = screen.getByTestId('rec-row-Qwen/Qwen3-32B-GGUF');
    expect(row.textContent).toContain('44.2 GB VRAM');
    expect(row.textContent).toContain('~1.8 tok/s');
    expect(row.textContent).toContain('score 58');
    // The raw, unrounded floats must not leak into the DOM.
    expect(row.textContent).not.toContain('44.15923222899437');
    expect(row.textContent).not.toContain('1.7711205344329897');
    expect(row.textContent).not.toContain('57.629999999999995');
  });

  it('[O3 / known limitation] renders "No recommendations yet" for an empty ranked set', () => {
    render(
      <RecommendationsCard
        recommendations={[]}
        recommendationsError={null}
        proposals={[]}
        onDecided={() => {}}
        loading={false}
      />
    );
    expect(screen.getByTestId('rec-empty').textContent).toMatch(/no recommendations yet/i);
  });

  it('renders the empty state when recommendations are LMLM-disabled', () => {
    render(
      <RecommendationsCard
        recommendations={null}
        recommendationsError="LMLM disabled"
        proposals={[]}
        onDecided={() => {}}
        loading={false}
      />
    );
    expect(screen.getByTestId('rec-empty')).toBeDefined();
  });

  it('renders each pending proposal with Approve + Reject buttons', () => {
    render(
      <RecommendationsCard
        recommendations={[]}
        recommendationsError={null}
        proposals={[PROPOSAL]}
        onDecided={() => {}}
        loading={false}
      />
    );
    expect(screen.getByTestId('proposal-mp-1').textContent).toContain(
      'Qwen3-32B beats the incumbent by 12 points'
    );
    expect(screen.getByRole('button', { name: /approve/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /reject/i })).toBeDefined();
  });

  it('Approve POSTs to /approve and calls onDecided on success', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okRes()));
    vi.stubGlobal('fetch', fetchMock);
    const onDecided = vi.fn();

    render(
      <RecommendationsCard
        recommendations={[]}
        recommendationsError={null}
        proposals={[PROPOSAL]}
        onDecided={onDecided}
        loading={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/v1/proposals/mp-1/approve');
    expect((init as RequestInit).method).toBe('POST');
    // XP-4: approve sends NO body — the route derives decidedBy from the auth
    // token and never reads a body field, so no dead { decidedBy } is posted.
    expect((init as RequestInit).body).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('Reject with a reason POSTs to /reject and calls onDecided', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okRes()));
    vi.stubGlobal('fetch', fetchMock);
    const onDecided = vi.fn();

    render(
      <RecommendationsCard
        recommendations={[]}
        recommendationsError={null}
        proposals={[PROPOSAL]}
        onDecided={onDecided}
        loading={false}
      />
    );
    fireEvent.change(screen.getByTestId('reject-reason-mp-1'), {
      target: { value: 'not worth the disk' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/v1/proposals/mp-1/reject');
    expect((init as RequestInit).method).toBe('POST');
    expect(String((init as RequestInit).body)).toContain('not worth the disk');
    vi.unstubAllGlobals();
  });

  it('two synchronous clicks fire only one POST (synchronous double-submit guard)', async () => {
    // Keep the POST in-flight so `busy` state never flushes between the two
    // synchronous clicks — proving the ref guard, not the disabled re-render.
    let resolveFetch: () => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(okRes());
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDecided = vi.fn();

    render(
      <RecommendationsCard
        recommendations={[]}
        recommendationsError={null}
        proposals={[PROPOSAL]}
        onDecided={onDecided}
        loading={false}
      />
    );
    const approve = screen.getByRole('button', { name: /approve/i });
    // Both clicks dispatched inside ONE act() so React batches state updates and
    // does NOT re-render (or apply disabled={busy}) between them — the button is
    // still enabled at the second click. Only the synchronous busyRef guard can
    // stop the second POST here; the disabled-attribute path cannot.
    act(() => {
      approve.click();
      approve.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch();
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('a failed POST surfaces an inline error and does not call onDecided', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 409, text: async () => 'conflict' } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onDecided = vi.fn();

    render(
      <RecommendationsCard
        recommendations={[]}
        recommendationsError={null}
        proposals={[PROPOSAL]}
        onDecided={onDecided}
        loading={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(screen.getByTestId('proposal-error-mp-1')).toBeDefined());
    expect(onDecided).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
