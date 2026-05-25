import type { NamingRubric } from './index.js';

export const verbNounHonestyRubric: NamingRubric = {
  id: 'NAME-R003',
  title: 'Verb / noun honesty',
  description:
    'Functions should read as verbs (or verb-phrases); types and data should read as nouns; ' +
    'booleans should read as questions (`isReady`, `hasPermission`, `canEdit`, not `ready` ' +
    "or `permission`). A function named `userEmail()` looks like a getter for the user's " +
    'email; a boolean named `enabled` could be a flag setter, getter, or state value.',
  source: 'Beck, Implementation Patterns + general OOP idiom',
  appliesTo: ['variable', 'function', 'type'],
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
