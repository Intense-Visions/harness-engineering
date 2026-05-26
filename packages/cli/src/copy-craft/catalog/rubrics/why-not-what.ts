import type { CopyRubric } from './index.js';

export const whyNotWhatRubric: CopyRubric = {
  id: 'COPY-R008',
  title: 'Explains WHY, not WHAT',
  description:
    'Comments should explain the non-obvious reason for a piece of code, not narrate what ' +
    'the code does. "// increment counter" next to `i++` is noise; "// counter must skip ' +
    'sentinel rows; see issue #482" carries WHY. Watch for comments that restate the next ' +
    'line in English; flag them as candidates for removal or rewrite. Also flag stale ' +
    'comments — comments that contradict the code they sit next to.',
  source: 'Martin, Clean Code ch. 4 + Beck, Implementation Patterns',
  appliesToSurfaces: ['comment'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
