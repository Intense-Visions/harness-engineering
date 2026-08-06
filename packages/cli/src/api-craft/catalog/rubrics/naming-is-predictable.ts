import type { ApiRubric } from './types.js';

export const namingIsPredictableRubric: ApiRubric = {
  id: 'API-R002',
  title: 'Resource naming and URL structure are predictable',
  description:
    'A consumer who has learned one endpoint should be able to guess the next. Ask: are ' +
    'collection resources named consistently (all plural `/invoices/{id}`, not `/invoice/{id}` ' +
    'here and `/customers` there)? Is nesting used for genuine ownership (`/customers/{id}/cards`) ' +
    'and NOT for incidental relationships that should be top-level with a filter? Above all: does ' +
    'each thing sit where a caller would look for it — an attribute that SELECTS among resources ' +
    'belongs in the path (`/orders/{id}`), while an attribute that FILTERS or shapes a collection ' +
    'belongs in the query string (`/orders?status=paid&limit=20`), never a status baked into the ' +
    'path segment (`/orders/paid`). Watch for: verbs in paths where a verb-free noun plus an HTTP ' +
    'method would do; casing that flips between kebab and snake; identifiers and filters swapped ' +
    'between path and query; abbreviations only the author would expand. GitHub’s REST API sets ' +
    'the bar for a uniform, guessable path grammar.',
  appliesTo: ['*'],
  source: 'GitHub REST API v3 conventions + Zalando RESTful API Guidelines (naming)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
