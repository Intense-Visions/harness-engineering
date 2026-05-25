import type { NamingRubric } from './index.js';

export const predictivePowerRubric: NamingRubric = {
  id: 'NAME-R001',
  title: 'Predictive power',
  description:
    "Does the name predict the thing's behavior or contract from a stranger's reading? " +
    'Names like `processData()` or `handle()` predict nothing. Names like `parseCsvRow()` ' +
    'or `userInvitationEmailSubject` predict both the operation and the artifact.',
  source: 'Martin, Clean Code, ch. 2 (Meaningful Names)',
  appliesTo: ['variable', 'function', 'type', 'file'],
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
