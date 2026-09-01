import { describe, it, expect } from 'vitest';
import { evaluateReleaseInventory } from './evaluate';
import { DEFAULT_RELEASE_INVENTORY_THRESHOLDS } from './types';
import type { ReleaseInventory, ReleaseInventoryThresholds } from './types';

const CHANNEL = { kind: 'git-tag', pattern: 'v*' } as const;

function inventory(overrides: Partial<ReleaseInventory>): ReleaseInventory {
  return {
    channel: CHANNEL,
    shippedDefinition: 'git tags matching "v*"',
    lastRelease: { name: 'v1.0.0', date: '2026-08-01T00:00:00Z' },
    unbounded: false,
    pendingChangesets: [],
    pendingChangesetCount: 0,
    oldestChangesetAgeDays: null,
    unreleasedCommits: [],
    unreleasedCommitCount: 0,
    unreleasedMergeCount: 0,
    oldestUnreleasedAgeDays: null,
    ...overrides,
  };
}

const T: ReleaseInventoryThresholds = DEFAULT_RELEASE_INVENTORY_THRESHOLDS;

describe('evaluateReleaseInventory', () => {
  it('is ok when every signal is under threshold (SC5)', () => {
    const r = evaluateReleaseInventory(
      inventory({
        pendingChangesetCount: 3,
        unreleasedCommitCount: 5,
        unreleasedMergeCount: 2,
        oldestUnreleasedAgeDays: 4,
      }),
      T
    );
    expect(r.status).toBe('ok');
    expect(r.breached).toBe(false);
    expect(r.breaches).toHaveLength(0);
  });

  it('warns and fires when pending changesets exceed the max (SC5)', () => {
    const r = evaluateReleaseInventory(inventory({ pendingChangesetCount: 21 }), T);
    expect(r.status).toBe('warn');
    expect(r.breached).toBe(true);
    expect(r.breaches.map((b) => b.metric)).toContain('pendingChangesets');
  });

  it('warns when the oldest change (from either source) exceeds max age', () => {
    const r = evaluateReleaseInventory(inventory({ oldestChangesetAgeDays: 45 }), T);
    expect(r.breached).toBe(true);
    expect(r.breaches.find((b) => b.metric === 'age')?.observed).toBe(45);
  });

  it('warns when unreleased merges exceed the max', () => {
    const r = evaluateReleaseInventory(
      inventory({ unreleasedCommitCount: 60, unreleasedMergeCount: 51 }),
      T
    );
    expect(r.breached).toBe(true);
    expect(r.breaches.map((b) => b.metric)).toContain('unreleasedMerges');
  });

  it('fires on an unbounded repo that holds inventory (AC1)', () => {
    const r = evaluateReleaseInventory(
      inventory({
        unbounded: true,
        lastRelease: null,
        pendingChangesetCount: 1,
        unreleasedCommitCount: 10,
      }),
      T
    );
    expect(r.status).toBe('unbounded');
    expect(r.breached).toBe(true);
    expect(r.breaches.map((b) => b.metric)).toContain('unbounded');
  });

  it('does not fire on an unbounded repo with an empty inventory', () => {
    const r = evaluateReleaseInventory(inventory({ unbounded: true, lastRelease: null }), T);
    expect(r.status).toBe('unbounded');
    expect(r.breached).toBe(false);
  });
});
