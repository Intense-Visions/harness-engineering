import type { DocsRubric } from './types.js';

export const examplesEarnTheirPlaceRubric: DocsRubric = {
  id: 'DOCS-R003',
  title: 'Examples earn their place (concrete, runnable, non-redundant)',
  description:
    'Every code example should earn its place: it teaches something the surrounding prose ' +
    'cannot, it is concrete enough to copy and run, and it is not a near-duplicate of the ' +
    'example above it. Ask: is this example real (plausible values, not "foo"/"bar" when a ' +
    'realistic payload would teach more), complete enough to run, and does it show the ' +
    'happy path AND at least gesture at what a real response or failure looks like? Watch for: ' +
    'snippets that stop before the interesting line; three examples that vary only in a ' +
    'constant; placeholder-only code that never shows output; examples with no surrounding ' +
    'sentence saying what to notice. Stripe and Tailwind docs set the bar — every snippet is ' +
    'copy-paste runnable and paired with the result it produces.',
  appliesTo: ['reference', 'guide', 'readme'],
  source: 'Stripe API reference + Tailwind CSS docs (runnable-example discipline)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
