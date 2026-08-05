import type { CodeRubric } from './types.js';

export const simplestItCouldBeRubric: CodeRubric = {
  id: 'CODE-R005',
  title: 'As simple as it could be (accidental complexity removed)',
  description:
    'The best version of a unit is the simplest one that still does the job — essential ' +
    'complexity kept, accidental complexity deleted. Ask: is there an obvious-in-retrospect ' +
    'simplification a senior would reach for on sight? Could a senior delete half of this ' +
    'without losing behavior? Watch for: intermediate variables that are used once and named ' +
    'nothing; hand-rolled loops that a single map/filter/find expresses; state accumulated ' +
    'across a function that a direct return would avoid; special-cases that the general case ' +
    'already covers; cleverness (bit tricks, dense ternaries, meta-programming) chosen over the ' +
    'plain form for no measured reason. Distinguish essential from accidental: do NOT flag ' +
    'complexity the problem genuinely demands, and do NOT reward terseness that hurts clarity. ' +
    'The target is the reading a maintainer would call "obviously correct," not merely "short".',
  source: 'Brooks, No Silver Bullet (essential vs accidental complexity) + Beck, Tidy First?',
  appliesToKinds: ['function', 'method', 'class'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
