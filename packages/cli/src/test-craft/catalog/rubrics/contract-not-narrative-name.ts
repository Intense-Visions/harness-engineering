import type { TestRubric } from './index.js';

export const contractNotNarrativeNameRubric: TestRubric = {
  id: 'TEST-R001',
  title: 'Test name describes the contract, not the narrative',
  description:
    'A test name should describe the CONTRACT that the system satisfies under specific ' +
    'conditions, not narrate what the test does. "returns null when input is empty" beats ' +
    '"tests the empty case". "rejects unauthenticated requests with 401" beats "auth test". ' +
    'Watch for narrative tells: "works", "correctly", "handles", "tests", "checks", or names ' +
    'that restate the function name without adding a condition.',
  source: 'Kent C. Dodds + Beck, "Test-Driven Development by Example"',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
