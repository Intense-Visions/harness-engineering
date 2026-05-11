import { describe, it, expect } from 'vitest';
import { refetchAndCompare, withBackoff } from '../../../src/roadmap/tracker/conflict';
import { ConflictError } from '../../../src/roadmap/tracker/client';
import type { TrackedFeature, FeaturePatch } from '../../../src/roadmap/tracker/client';

function feat(over: Partial<TrackedFeature> = {}): TrackedFeature {
  return {
    externalId: 'github:o/r#1',
    name: 'F',
    status: 'in-progress',
    summary: 'sum',
    spec: null,
    plans: [],
    blockedBy: [],
    assignee: null,
    priority: null,
    milestone: null,
    createdAt: '2026-05-09T00:00:00Z',
    updatedAt: null,
    ...over,
  };
}

describe('refetchAndCompare', () => {
  it('a) server matches caller view → ok:true (no conflict)', () => {
    const server = feat({ assignee: '@x', status: 'in-progress' });
    const patch: FeaturePatch = { summary: 'sum' };
    const cmp = refetchAndCompare(server, patch);
    expect(cmp.ok).toBe(true);
  });

  it('b) server assignee differs and patch.assignee would clobber → conflict diff', () => {
    const server = feat({ assignee: '@bob' });
    const patch: FeaturePatch = { assignee: '@alice' };
    const cmp = refetchAndCompare(server, patch);
    expect(cmp.ok).toBe(false);
    expect(cmp.diff?.assignee).toEqual({ ours: '@alice', theirs: '@bob' });
  });

  it('c) server status is done; patch tries to set in-progress → conflict (terminal sticky)', () => {
    const server = feat({ status: 'done' });
    const patch: FeaturePatch = { status: 'in-progress' };
    const cmp = refetchAndCompare(server, patch);
    expect(cmp.ok).toBe(false);
    expect(cmp.diff?.status).toEqual({ ours: 'in-progress', theirs: 'done' });
  });

  it('d) idempotent claim: server already claimed by same assignee → ok:true, idempotent:true', () => {
    const server = feat({ assignee: '@alice', status: 'in-progress' });
    const patch: FeaturePatch = { assignee: '@alice', status: 'in-progress' };
    const cmp = refetchAndCompare(server, patch);
    expect(cmp.ok).toBe(true);
    expect(cmp.idempotent).toBe(true);
  });

  it('e) idempotent complete: server done, patch sets done → ok:true, idempotent:true', () => {
    const server = feat({ status: 'done' });
    const patch: FeaturePatch = { status: 'done' };
    const cmp = refetchAndCompare(server, patch);
    expect(cmp.ok).toBe(true);
    expect(cmp.idempotent).toBe(true);
  });

  it('priority/milestone/spec mismatch produces a diff', () => {
    const server = feat({ priority: 'P1', milestone: 'M1', spec: 'docs/specs/a.md' });
    const patch: FeaturePatch = { priority: 'P3', milestone: 'M2', spec: 'docs/specs/b.md' };
    const cmp = refetchAndCompare(server, patch);
    expect(cmp.ok).toBe(false);
    expect(cmp.diff?.priority).toEqual({ ours: 'P3', theirs: 'P1' });
    expect(cmp.diff?.milestone).toEqual({ ours: 'M2', theirs: 'M1' });
    expect(cmp.diff?.spec).toEqual({ ours: 'docs/specs/b.md', theirs: 'docs/specs/a.md' });
  });
});

describe('withBackoff', () => {
  it('f) retries on transient errors but bubbles ConflictError immediately', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new ConflictError('github:o/r#1', { assignee: { ours: 'a', theirs: 'b' } });
    };
    let thrown: unknown;
    try {
      await withBackoff(fn, { maxAttempts: 3, baseDelayMs: 1, sleep: () => Promise.resolve() });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConflictError);
    expect(calls).toBe(1); // no retries
  });

  it('retries up to maxAttempts on non-conflict errors', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error(`transient ${calls}`);
    };
    let thrown: unknown;
    try {
      await withBackoff(fn, { maxAttempts: 3, baseDelayMs: 1, sleep: () => Promise.resolve() });
    } catch (e) {
      thrown = e;
    }
    expect(calls).toBe(3);
    expect((thrown as Error).message).toBe('transient 3');
  });

  it('returns the result on first success', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return 'ok';
    };
    const r = await withBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleep: () => Promise.resolve(),
    });
    expect(r).toBe('ok');
    expect(calls).toBe(1);
  });
});
