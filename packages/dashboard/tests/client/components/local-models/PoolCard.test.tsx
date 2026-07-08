import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('PoolCard', () => {
  it('renders one row per entry with its fields', () => {
    render(<PoolCard pool={POOL} error={null} loading={false} />);
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('qwen3:32b');
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('Qwen/Qwen3-32B-GGUF');
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('18');
    expect(screen.getByTestId('pool-row-qwen3:32b').textContent).toContain('82');
    expect(screen.getByTestId('pool-row-llama3:8b')).toBeDefined();
  });

  it('renders a disk-usage indicator with used vs budget', () => {
    render(<PoolCard pool={POOL} error={null} loading={false} />);
    expect(screen.getByTestId('pool-disk').textContent).toContain('40');
    expect(screen.getByTestId('pool-disk').textContent).toContain('100');
  });

  it('renders a pending-eviction badge for entries flagged pendingEviction', () => {
    render(<PoolCard pool={POOL} error={null} loading={false} />);
    expect(screen.getByTestId('pool-pending-llama3:8b')).toBeDefined();
    // The non-pending entry has no badge.
    expect(screen.queryByTestId('pool-pending-qwen3:32b')).toBeNull();
  });

  it('[O3] renders "No models in the pool" for an empty pool — no throw', () => {
    render(
      <PoolCard pool={{ ...POOL, entries: [], diskUsedGb: 0 }} error={null} loading={false} />
    );
    expect(screen.getByTestId('pool-card').textContent).toMatch(/no models in the pool/i);
  });

  it('renders the disabled state when LMLM is disabled', () => {
    render(<PoolCard pool={null} error="LMLM disabled" loading={false} />);
    expect(screen.getByTestId('pool-card').textContent).toMatch(/LMLM disabled/i);
  });

  it('exposes no install/evict controls (D-P8-2 read-only)', () => {
    render(<PoolCard pool={POOL} error={null} loading={false} />);
    expect(screen.queryByRole('button', { name: /install|evict/i })).toBeNull();
  });
});
