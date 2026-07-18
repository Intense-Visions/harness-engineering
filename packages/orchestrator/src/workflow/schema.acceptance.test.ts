import { describe, it, expect } from 'vitest';
import { StagedWorkflowDeclSchema } from './schema';

/**
 * staged-verify-gate-convergence Phase 1 (D2, schema): the staged workflow decl
 * gains an optional `acceptance` command (a shell command run in the workspace at
 * settle to gate the unit). Config validation must ACCEPT the field — a type-only
 * add is silently rejected by the strict Zod schema (the AMR config-surface gap).
 */

const decl = (extra: Record<string, unknown>) => ({
  name: 'wf',
  match: { labels: ['feature'] },
  stages: [
    { skill: 'implement', produces: 'code' },
    { skill: 'review', produces: 'review', expects: 'code' },
  ],
  ...extra,
});

describe('StagedWorkflowDeclSchema — optional acceptance command (D2)', () => {
  it('accepts a decl WITH an acceptance command', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl({ acceptance: 'pnpm --filter @acme/pkg test' })
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.acceptance).toBe('pnpm --filter @acme/pkg test');
  });

  it('accepts a decl WITHOUT acceptance (byte-compatible with pre-Phase-1 decls)', () => {
    const r = StagedWorkflowDeclSchema.safeParse(decl({}));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.acceptance).toBeUndefined();
  });

  it('rejects a non-string acceptance value', () => {
    const r = StagedWorkflowDeclSchema.safeParse(decl({ acceptance: 42 }));
    expect(r.success).toBe(false);
  });

  it('rejects an empty acceptance string (a command must be non-empty)', () => {
    const r = StagedWorkflowDeclSchema.safeParse(decl({ acceptance: '' }));
    expect(r.success).toBe(false);
  });
});
