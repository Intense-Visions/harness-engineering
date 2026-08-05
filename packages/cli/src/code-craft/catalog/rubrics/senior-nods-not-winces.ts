import type { CodeRubric } from './types.js';

export const seniorNodsNotWincesRubric: CodeRubric = {
  id: 'CODE-R007',
  title: 'A senior would nod, not wince',
  description:
    'The holistic pass: read this unit as a senior engineer skimming a PR. Does anything make ' +
    'them wince — not a rule violation you can name, but the practiced sense that this will bite ' +
    'someone later? Ask: is clarity chosen over cleverness? Are there landmines a maintainer ' +
    'would step on (silent mutation of a shared structure, an ordering dependency between calls, ' +
    'a resource opened and maybe not closed, an `await` missing in a loop, a comparison that ' +
    'works today by luck)? Would this pass review without a reviewer sighing and asking for a ' +
    'rewrite? Watch for code that is correct but unkind to the next reader: dense one-liners ' +
    'that hide a bug, TODO-shaped shortcuts, defensive noise that signals the author didn’t ' +
    'trust their own model. Reserve `foundational` for genuine wince moments; use `polish`/' +
    '`aspirational` for "good, could be great." Do not restate findings the other rubrics ' +
    'already made — add the judgment only a human reviewer would.',
  source:
    'Kernighan & Pike, The Practice of Programming + Google Engineering Practices (readability review)',
  appliesToKinds: ['function', 'method', 'class'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
