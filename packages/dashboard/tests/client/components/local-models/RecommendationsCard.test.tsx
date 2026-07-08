import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ModelProposalRecord } from '@harness-engineering/types';
import { RecommendationsCard } from '../../../../src/client/components/local-models/RecommendationsCard';
import type { DashRankedModel } from '../../../../src/client/types/local-models';

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
