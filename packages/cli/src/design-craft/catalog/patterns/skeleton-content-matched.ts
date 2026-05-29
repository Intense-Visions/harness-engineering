// packages/cli/src/design-craft/catalog/patterns/skeleton-content-matched.ts
//
// Phase 2 catalog increment — second polish pattern. Ported from the Phase 0
// paper spike:
//   docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/
//   patterns/skeleton-content-matched.md
//
// CRAFT-P002. Exercises a different tier × impact combination from
// spring-physics (polish × large vs. polish × medium) and introduces two new
// `applicableTo.kind` values (`component-name`, `jsx-text`) that demonstrate
// the schema's intentional open-endedness on `kind` (Phase 0 review O7).
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Skeleton (Content-Matched).
 *
 * Replaces generic spinners / "Loading..." text with a skeleton that mirrors
 * the about-to-appear content. The large-impact bias reflects how often this
 * pattern is the difference between a loading state that punishes the user
 * for waiting and one that previews the destination layout.
 */
export const skeletonContentMatchedPattern: PatternDefinition = {
  id: 'pattern-skeleton-content-matched',
  name: 'Skeleton (Content-Matched)',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-23',
  contributors: ['@chadjw'],
  source: {
    ref: 'linear-app#loading-state',
    url: 'https://linear.app',
  },
  applicableTo: [
    { kind: 'component-name', match: 'Spinner' },
    { kind: 'component-name', match: 'Loading' },
    { kind: 'jsx-text', match: 'Loading...' },
  ],
  when: [
    'Loading state is represented by a generic spinner or "Loading..." text',
    "that gives no preview of what's about to appear. Eye lands on the",
    'spinner, then has to re-orient when content arrives. This punishes',
    'the user for waiting.',
  ].join('\n'),
  suggest: [
    'Replace with a content-matched skeleton that mirrors the layout of',
    'the about-to-appear content (same row counts, same column widths,',
    'same aspect ratios). Use a subtle shimmer (gradient sweep, 1.5s',
    'cycle) or a static muted-fill. Skeleton blocks should match the',
    "expected text width within ~20% so the layout doesn't reflow on",
    'arrival.',
    'Pair with `prefers-reduced-motion` to disable the shimmer animation',
    '(fall back to static fill).',
  ].join('\n'),
  before: ['{isLoading && <Spinner />}', '{data && <UserList users={data} />}'].join('\n'),
  after: [
    '{isLoading && (',
    '  <UserListSkeleton rows={data?.length ?? 5} />',
    ')}',
    '{data && <UserList users={data} />}',
    '',
    '// UserListSkeleton mirrors UserList: same avatar circle, same',
    '// 60%-width name bar, same 40%-width metadata bar per row.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P002',
    tier: 'polish',
    impact: 'large',
    phase: 'polish',
  },
};
