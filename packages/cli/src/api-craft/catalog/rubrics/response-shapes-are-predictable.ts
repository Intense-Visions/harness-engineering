import type { ApiRubric } from './types.js';

export const responseShapesArePredictableRubric: ApiRubric = {
  id: 'API-R006',
  title: 'Response shapes are predictable and consistent',
  description:
    'A stranger should be able to predict the response shape from the request without reading the ' +
    'docs twice. Ask: does the same resource come back in the same shape everywhere it appears ' +
    '(the Customer embedded in an Invoice matches the Customer from `/customers/{id}`)? Is the ' +
    'envelope consistent — either every response is wrapped (`{ "data": … }`) or none is, not a ' +
    'mix? Are field names, casing, date formats (ISO-8601), and money representations uniform ' +
    'across the surface? Does a create/update return the full resource so the caller need not ' +
    'immediately re-fetch? Is a single-item response the same object shape whether fetched alone ' +
    'or inside a list item? Watch for: casing that flips between endpoints; a field that is a ' +
    'string here and an object there; timestamps as epoch millis in one place and ISO strings in ' +
    'another; a mutation that returns only an id, forcing a round-trip. Linear’s GraphQL API and ' +
    'Stripe set the bar for shape consistency.',
  appliesTo: ['*'],
  source: 'Stripe / Linear API response conventions + Zalando RESTful API Guidelines (JSON)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
