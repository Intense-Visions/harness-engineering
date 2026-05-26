import type { TestRubric } from './index.js';

export const arrangeActAssertRubric: TestRubric = {
  id: 'TEST-R003',
  title: 'Arrange / Act / Assert clarity',
  description:
    'A well-structured test has three visually distinct phases: ARRANGE the inputs and ' +
    'preconditions, ACT by exercising the system, ASSERT the outcomes. Interleaving the three ' +
    '(arrange → act → assert → arrange → act → assert) signals either multiple tests merged ' +
    'into one (split them) or a sequence of state mutations being verified inline (extract a ' +
    'helper or use a different assertion style). A single test should answer one question; ' +
    'its structure should reveal that question at a glance.',
  source: 'Bill Wake, "3A — Arrange, Act, Assert" + xUnit Patterns',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
