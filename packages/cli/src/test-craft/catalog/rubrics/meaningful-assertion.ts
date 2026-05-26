import type { TestRubric } from './index.js';

export const meaningfulAssertionRubric: TestRubric = {
  id: 'TEST-R002',
  title: 'Assertion proves something non-trivial',
  description:
    'An assertion should fail when the contract breaks, not when nothing breaks. ' +
    '`expect(x).toBeDefined()` after `const x = 5` is tautology. `expect(result.length).toBeGreaterThan(0)` ' +
    'right after a setup that always produces non-empty results proves nothing. Each assertion should ' +
    'name a condition the implementation could plausibly violate. Watch for: setup that obviously ' +
    'makes the assertion true; matchers that accept too much (`toBeTruthy`, `toBeDefined`, ' +
    "`toContain('')`); double-counting (assert then re-assert the same fact).",
  source: 'Martin Fowler, "Refactoring" (test smells) + xUnit Patterns (Meszaros)',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
