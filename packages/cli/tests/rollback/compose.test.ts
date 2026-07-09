import { describe, it, expect, vi } from 'vitest';
import { composeRevertPr, buildRevertBody, ROLLBACK_LABEL } from '../../src/rollback/compose';
import type { RollbackDecision } from '@harness-engineering/core';

const baseDecision: RollbackDecision = {
  targetPr: 42,
  trigger: 'signal',
  revertReady: true,
  reasons: ['clean revert with no dependent later merge'],
  cleanRevert: true,
  dependentMerges: [],
  blastRadius: 7,
  migrationWarnings: ['db/migrations/001.sql (migration directory) — verify...'],
  action: 'proposed',
};

function fakeGh(existing: number[] = [], url = 'https://gh/pr/99') {
  return {
    findOpenRevertPr: vi.fn(async () => (existing.length ? existing[0]! : null)),
    findOpenRevertPrUrl: vi.fn(async () => (existing.length ? url : null)),
    openPr: vi.fn(async () => url),
  };
}

describe('buildRevertBody', () => {
  it('includes trigger, target, blast-radius, migration warnings, and reasons (SC3)', () => {
    const body = buildRevertBody(baseDecision, 'Add feature X');
    expect(body).toMatch(/trigger.*signal/i);
    expect(body).toContain('#42');
    expect(body).toMatch(/blast.?radius.*7/i);
    expect(body).toContain('migration');
    expect(body).toContain('clean revert with no dependent later merge');
  });

  it('renders **Reason:** when a reason is provided, and omits it otherwise (#4)', () => {
    const withReason = buildRevertBody(baseDecision, 'Add feature X', 'flaky checkout flow');
    expect(withReason).toContain('**Reason:** flaky checkout flow');
    const withoutReason = buildRevertBody(baseDecision, 'Add feature X');
    expect(withoutReason).not.toContain('**Reason:**');
    // whitespace-only reason is treated as absent
    expect(buildRevertBody(baseDecision, 'Add feature X', '   ')).not.toContain('**Reason:**');
  });
});

describe('composeRevertPr', () => {
  it('opens exactly one labeled PR when none exists (SC1)', async () => {
    const gh = fakeGh([]);
    const res = await composeRevertPr(baseDecision, 'Add feature X', { gh });
    expect(gh.openPr).toHaveBeenCalledTimes(1);
    const [args] = gh.openPr.mock.calls[0]!;
    expect(args.title).toBe('revert: Add feature X (automated rollback)');
    expect(args.label).toBe(ROLLBACK_LABEL);
    expect(res).toEqual({ action: 'proposed', prUrl: 'https://gh/pr/99' });
  });

  it('is idempotent — skips when an open revert PR already exists (SC1)', async () => {
    const gh = fakeGh([99]);
    const res = await composeRevertPr(baseDecision, 'Add feature X', { gh });
    expect(gh.openPr).not.toHaveBeenCalled();
    expect(res.action).toBe('skipped');
    expect(res.prUrl).toBe('https://gh/pr/99');
  });

  it('dry-run prints the body and never opens a PR', async () => {
    const gh = fakeGh([]);
    const printed: string[] = [];
    const res = await composeRevertPr(baseDecision, 'Add feature X', {
      gh,
      dryRun: true,
      print: (s) => printed.push(s),
    });
    expect(gh.openPr).not.toHaveBeenCalled();
    expect(printed.join('\n')).toContain('#42');
    expect(res.action).toBe('proposed'); // dry-run reports what WOULD happen
    expect(res.prUrl).toBeUndefined();
  });

  it('does not compose for a non-revert-ready decision', async () => {
    const gh = fakeGh([]);
    const blocked = { ...baseDecision, revertReady: false, action: 'blocked' as const };
    const res = await composeRevertPr(blocked, 'Add feature X', { gh });
    expect(gh.openPr).not.toHaveBeenCalled();
    expect(res.action).toBe('blocked');
  });
});
