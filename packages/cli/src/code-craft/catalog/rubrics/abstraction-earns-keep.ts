import type { CodeRubric } from './types.js';

export const abstractionEarnsKeepRubric: CodeRubric = {
  id: 'CODE-R004',
  title: 'Abstraction earns its keep',
  description:
    'A good abstraction is deep: its interface is much simpler than the machinery it hides, so ' +
    'the caller carries less than the author did. Ask: does this unit pull its weight, or is it ' +
    'a shallow pass-through whose signature is as complex as its body (a wrapper that forwards ' +
    'every argument, a class with one method that could be a function)? Is it premature — an ' +
    'abstraction invented for a single caller, a config object with one field, an interface with ' +
    'one implementation and no second on the horizon? Conversely, is a genuine concept missing — ' +
    'the same five lines copied in three places crying out for one named home (Rule of Three)? ' +
    'Watch for: leaky abstractions that force the caller to understand the internals anyway; ' +
    'indirection that adds a hop without hiding anything. The bar: the abstraction should reduce, ' +
    'not relocate, the reader’s cognitive load.',
  source:
    'Ousterhout, A Philosophy of Software Design (deep vs shallow modules) + Fowler, Refactoring (Rule of Three)',
  appliesToKinds: ['function', 'method', 'class'],
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
