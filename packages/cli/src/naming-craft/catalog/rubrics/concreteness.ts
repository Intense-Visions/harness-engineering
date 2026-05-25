import type { NamingRubric } from './index.js';

export const concretenessRubric: NamingRubric = {
  id: 'NAME-R002',
  title: 'Concreteness',
  description:
    'Concrete names beat vague ones. `buildInvoice` is concrete; `processData` is vague. ' +
    'The vague version asks the reader to scan the body to learn what the function does; ' +
    'the concrete version states it. Generic words to suspect: handle, process, manage, ' +
    'do, run, exec, perform, util, helper, data, info, value, item, thing.',
  source: 'Martin, Clean Code + Beck, Smalltalk Best Practice Patterns',
  appliesTo: ['variable', 'function', 'type'],
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
