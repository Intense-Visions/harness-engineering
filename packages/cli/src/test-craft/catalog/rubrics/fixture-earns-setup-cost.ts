import type { TestRubric } from './index.js';

export const fixtureEarnsSetupCostRubric: TestRubric = {
  id: 'TEST-R004',
  title: 'Fixture earns its setup cost',
  description:
    'Heavy `beforeEach` / factory / shared-fixture setup must be justified by what the test ' +
    'actually verifies. A 47-line `beforeEach` followed by `expect(result).toBeDefined()` is ' +
    'rope-throwing. Setup belongs in a test only if the assertion meaningfully depends on it. ' +
    "If a fixture is reused across many tests, that's reuse-justified; if it serves only this " +
    'test, the per-test work-to-signal ratio should be roughly balanced. Watch for: long setup ' +
    "blocks with trivial assertions; setup that depends on state the assertion doesn't read; " +
    "factory complexity that exceeds the test's documented intent.",
  source: 'xUnit Patterns (Meszaros) — Fixture chapters',
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
