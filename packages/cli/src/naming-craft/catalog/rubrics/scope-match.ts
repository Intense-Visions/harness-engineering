import type { NamingRubric } from './index.js';

export const scopeMatchRubric: NamingRubric = {
  id: 'NAME-R005',
  title: 'Scope match',
  description:
    'Long-lived or exported names earn more characters; short-scoped names can be terse. ' +
    '`i` is fine in a 3-line loop, terrible as an exported const. `userInvitationAcceptanceToken` ' +
    'is justified at module scope, overkill as a loop variable. Punish exported single-letter ' +
    'and reward terseness in short scopes.',
  source: 'Beck, Smalltalk Best Practice Patterns — name length proportional to scope',
  appliesTo: ['variable', 'function', 'type'],
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
