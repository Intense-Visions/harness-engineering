import { describe, it, expect } from 'vitest';
import { StagedWorkflowDeclSchema } from './schema';

/**
 * 4b — `StagedWorkflowDeclSchema` cross-field refinement: a stage's `expects`
 * must name a `produces` from an EARLIER stage (the text channel can only thread
 * outputs already captured on the shared worktree). Catches label typos /
 * mis-orderings at config-load rather than silently threading nothing at runtime.
 */

const decl = (stages: Array<Record<string, unknown>>) => ({
  name: 'wf',
  match: { labels: ['feature'] },
  stages,
});

describe('StagedWorkflowDeclSchema — expects → earlier produces', () => {
  it('accepts a valid expects that references an earlier produces', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl([
        { skill: 'implement', produces: 'code' },
        { skill: 'review', produces: 'review', expects: 'code' },
      ])
    );
    expect(r.success).toBe(true);
  });

  it('accepts stages with no expects at all (byte-compatible with pre-4b decls)', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl([
        { skill: 'implement', produces: 'code' },
        { skill: 'review', produces: 'review' },
      ])
    );
    expect(r.success).toBe(true);
  });

  it('rejects an expects that names no earlier produces (typo)', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl([
        { skill: 'implement', produces: 'code' },
        { skill: 'review', produces: 'review', expects: 'cdoe' }, // typo
      ])
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.path).toEqual(['stages', 1, 'expects']);
      expect(r.error.issues[0]!.message).toMatch(/no earlier stage produces/);
    }
  });

  it('rejects a forward reference — expecting a LATER stage’s produces', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl([
        { skill: 'review', produces: 'review', expects: 'code' }, // code is produced later
        { skill: 'implement', produces: 'code' },
      ])
    );
    expect(r.success).toBe(false);
  });

  it('rejects a self-reference — a stage expecting its own produces (no earlier producer)', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl([{ skill: 'implement', produces: 'code', expects: 'code' }])
    );
    expect(r.success).toBe(false);
  });

  it('honors last-write: expecting a label re-produced by an earlier stage is valid', () => {
    const r = StagedWorkflowDeclSchema.safeParse(
      decl([
        { skill: 'draft', produces: 'code' },
        { skill: 'refine', produces: 'code' },
        { skill: 'review', produces: 'review', expects: 'code' },
      ])
    );
    expect(r.success).toBe(true);
  });
});
