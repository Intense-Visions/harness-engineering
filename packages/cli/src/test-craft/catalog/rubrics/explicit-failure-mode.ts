import type { TestRubric } from './index.js';

export const explicitFailureModeRubric: TestRubric = {
  id: 'TEST-R008',
  title: 'Failure message narrates what went wrong',
  description:
    "When a test fails, the assertion's failure message should narrate what went wrong without " +
    "the reader needing to read the test. `expect(result).toBe(true)` produces 'expected false " +
    "to be true' — true to what? About what?. `expect(result.role).toBe('admin')` produces " +
    "'expected user to be admin' — still vague without context. Custom matcher messages, " +
    'descriptive helper functions, or simply more-specific assertions (`expect(result).toEqual' +
    "({ role: 'admin', ... })` showing all expected fields) make failures actionable. The 3am " +
    'test is: can someone diagnose this failure from the assertion text alone?',
  source: 'xUnit Patterns + general test-engineering folklore',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
