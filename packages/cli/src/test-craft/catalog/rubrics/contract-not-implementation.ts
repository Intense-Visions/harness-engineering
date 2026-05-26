import type { TestRubric } from './index.js';

export const contractNotImplementationRubric: TestRubric = {
  id: 'TEST-R007',
  title: 'Test the contract, not the implementation',
  description:
    'A good test verifies the public contract of the system under test; it survives any ' +
    'refactor that preserves that contract. A bad test asserts implementation details that the ' +
    "contract doesn't promise (internal state, private method calls, intermediate values). " +
    'Watch for: spying on internal calls when the contract is the return value; mocking ' +
    'implementation collaborators when the contract is a black box; asserting field-by-field ' +
    "on a result object when the contract is 'returns a User'; testing that error messages " +
    "have specific wording when the contract is 'rejects invalid input'. Refactor-fragility is " +
    'the symptom; over-specification is the cause.',
  source: 'Beck + Fowler on contract-based testing + Kent C. Dodds, "Testing Trophy"',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
