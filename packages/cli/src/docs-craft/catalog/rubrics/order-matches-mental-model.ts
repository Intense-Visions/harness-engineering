import type { DocsRubric } from './types.js';

export const orderMatchesMentalModelRubric: DocsRubric = {
  id: 'DOCS-R002',
  title: 'Order matches the reader’s mental model (progressive disclosure)',
  description:
    'The sequence of a doc should track the order the reader needs the information, not the ' +
    'order the code was written or the author happened to think of things. Prerequisites come ' +
    'before the steps that need them; the common path comes before the edge cases; the concept ' +
    'and its motivation come before the exhaustive how-to. Ask: does the doc front-load the 20% ' +
    'a reader needs 80% of the time and defer the rare details? Watch for: reference material ' +
    'dumped before any orientation; an "Advanced configuration" block wedged between step 2 and ' +
    'step 3 of a getting-started flow; terms used pages before they are defined; a table of ' +
    'contents that mirrors the module layout instead of the reader’s journey. Stripe and Linear ' +
    'docs are exemplary at progressive disclosure — quickstart first, depth on demand.',
  appliesTo: ['*'],
  source: 'Diátaxis (tutorial vs reference separation) + Stripe / Linear documentation IA',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
