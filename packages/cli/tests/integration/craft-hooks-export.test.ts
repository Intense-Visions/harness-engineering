// packages/cli/tests/integration/craft-hooks-export.test.ts
//
// Phase 3, criterion 1. The root barrel's `--check` prints "up to date" no
// matter what `hooks/index.ts` exports, because the generated text is
// `export * from './hooks';` either way. That green cannot confirm this
// phase's export. This test can: it resolves the PUBLISHED surface a host
// actually imports (`@harness-engineering/core` -> core's built `dist`),
// never a relative source path, which would pass even with the barrel chain
// broken.
import { describe, it, expect } from 'vitest';
import {
  CRAFT_REVIEW_DOMAINS,
  CRAFT_REVIEW_EVENTS_BY_HOST,
  planCraftReviewDomains,
  resolveReviewHooksWithCraft,
} from '@harness-engineering/core';

describe('craft review hooks are exported from the package root', () => {
  it('exports the resolver, the plan function and the table', () => {
    expect(typeof resolveReviewHooksWithCraft).toBe('function');
    expect(typeof planCraftReviewDomains).toBe('function');
    expect(CRAFT_REVIEW_DOMAINS.length).toBeGreaterThan(0);
    expect(CRAFT_REVIEW_EVENTS_BY_HOST['harness-autopilot']).toEqual([
      'after:REVIEW',
      'after:FINAL_REVIEW',
    ]);
  });

  it('the exported resolver is live, not a shape', () => {
    const hooks = resolveReviewHooksWithCraft(null, 'harness-autopilot', 'after:REVIEW', {
      changedFiles: ['src/ui/Button.tsx'],
      availableSkills: new Set(['harness-design-craft']),
    });
    expect(hooks).toContainEqual({
      type: 'skill',
      skill: 'harness-design-craft',
      blocking: false,
    });
  });
});
