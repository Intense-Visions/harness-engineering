import type { TestRubric } from './index.js';

export const deletingLosesSomethingRubric: TestRubric = {
  id: 'TEST-R006',
  title: 'Deleting this test would lose something specific',
  description:
    'If you deleted this test today, what specific coverage or contract would the suite lose? ' +
    "If the answer is 'nothing — another test already covers that', the test is redundant; " +
    "consolidate or delete. If the answer is 'the case where X happens', great — name the test " +
    'after that case. Redundant tests are noise that crowd out signal in failure reports; they ' +
    'also slow the suite without adding confidence. Watch for: tests that re-verify what an ' +
    'adjacent test verifies; tests added to satisfy a coverage threshold without a real ' +
    'behavioral target; mirror-tests that pass `valid` and `invalid` to the same function and ' +
    'would be one parameterized test in a coherent design.',
  source: 'Kent C. Dodds, "Write tests. Not too many. Mostly integration." + Beck',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
