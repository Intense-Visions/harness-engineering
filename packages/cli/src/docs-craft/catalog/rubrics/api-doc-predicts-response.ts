import type { DocsRubric } from './types.js';

export const apiDocPredictsResponseRubric: DocsRubric = {
  id: 'DOCS-R005',
  title: 'API/reference docs let the reader predict the response shape',
  description:
    'Reference documentation for an API, function, or command should let the reader predict what ' +
    'they get back BEFORE they run it. Ask: are parameters documented with types, required-vs- ' +
    'optional, and defaults? Is the return / response shape shown — ideally a concrete example ' +
    'response, not just a prose description? Are error modes and status codes enumerated? Watch ' +
    'for: an endpoint documented only by its request; parameters with no type or default; a ' +
    '"returns an object" with no fields listed; success documented but every failure left to the ' +
    'reader to discover at runtime. Stripe’s API reference is the gold standard: every endpoint ' +
    'pairs the request with a full example response and the errors it can raise. MDN does the ' +
    'same for web APIs — return value and exceptions are always spelled out.',
  appliesTo: ['reference'],
  source: 'Stripe API reference + MDN Web Docs (return-value / exceptions convention)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
