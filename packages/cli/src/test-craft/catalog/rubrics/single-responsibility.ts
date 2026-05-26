import type { TestRubric } from './index.js';

export const singleResponsibilityRubric: TestRubric = {
  id: 'TEST-R005',
  title: 'One responsibility per test',
  description:
    'A single test should answer ONE question. Multiple unrelated assertions break poorly: ' +
    "the first failure stops execution, so the second / third never run and you don't see the " +
    "full picture. A test like `it('handles input', () => { expect(parse(a)).toBe(...); " +
    'expect(parse(b)).toBe(...); expect(format(c)).toBe(...) })` is three tests crammed into ' +
    'one. Each `it` should describe one specific behavior and verify it. Multiple assertions ' +
    'are FINE when they verify different facets of the same behavior (e.g. asserting both ' +
    'return value and side effect of the same call).',
  source: 'Kent Beck + Fowler, "Refactoring" (test smells: Eager Test)',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
