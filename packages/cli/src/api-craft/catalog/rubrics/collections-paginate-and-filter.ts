import type { ApiRubric } from './types.js';

export const collectionsPaginateAndFilterRubric: ApiRubric = {
  id: 'API-R007',
  title: 'Collections paginate and filter consistently',
  description:
    'Any collection that can grow must be bounded, and the way you page and filter it must be the ' +
    'same everywhere. Ask: does every list endpoint paginate by default (a cap, not "return all ' +
    'rows"), so a large tenant cannot degrade the service or the client? Is ONE pagination style ' +
    'used across the surface (cursor-based for large or mutating sets, offset/limit only where it ' +
    'is genuinely safe) rather than a different scheme per endpoint? Do filters live in the query ' +
    'string with consistent parameter names and operators, and is sorting expressed uniformly ' +
    '(`sort=-created_at`, not `orderBy` here and `sortDir` there)? Does the response tell the ' +
    'client how to get the next page (a cursor / link) rather than making it guess? Watch for: an ' +
    'unbounded list; offset pagination over a set that mutates under the reader (skips and ' +
    'dupes); filter params that differ per endpoint; a total-count that forces an expensive scan ' +
    'on every page. Stripe’s cursor pagination sets the bar.',
  appliesTo: ['*'],
  source: 'Stripe API pagination + Zalando RESTful API Guidelines (pagination)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
