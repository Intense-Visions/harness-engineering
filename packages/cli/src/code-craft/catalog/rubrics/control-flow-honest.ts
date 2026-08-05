import type { CodeRubric } from './types.js';

export const controlFlowHonestRubric: CodeRubric = {
  id: 'CODE-R002',
  title: 'Control flow is honest',
  description:
    'Honest control flow means every branch is load-bearing and the shape of the code matches ' +
    'the shape of the decision. Ask: are the conditionals doing real work, or are they ' +
    'accidental — defensive checks for states that can’t occur, flags that are always one value, ' +
    'nested pyramids that a guard clause would flatten? Does the happy path read straight down, ' +
    'with edge cases handled and returned early, or is the main logic buried three indents deep ' +
    'inside an `else`? Watch for: `if (x) { … } else { return }` that inverts more cleanly as an ' +
    'early guard; boolean parameters that split the body into two functions wearing one coat; ' +
    'redundant re-checks of a condition already established; a `try/catch` that swallows the ' +
    'error and continues as if nothing happened. The reader should never have to hold a stack ' +
    'of "but only if" in their head.',
  source:
    'Ousterhout, A Philosophy of Software Design (complexity) + Fowler, Refactoring (Replace Nested Conditional with Guard Clauses)',
  appliesToKinds: ['function', 'method'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
