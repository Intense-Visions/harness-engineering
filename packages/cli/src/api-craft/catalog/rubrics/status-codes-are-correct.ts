import type { ApiRubric } from './types.js';

export const statusCodesAreCorrectRubric: ApiRubric = {
  id: 'API-R004',
  title: 'Status codes are correct and meaningful',
  description:
    'The status code is the first thing every client branches on — it must carry honest meaning. ' +
    'Ask: does a success return the RIGHT 2xx (201 + Location for a create, 202 for accepted-but- ' +
    'async, 204 for an empty body — not a blanket 200)? Do client errors use the specific 4xx ' +
    '(400 malformed, 401 unauthenticated, 403 unauthorized, 404 absent, 409 conflict, 422 ' +
    'semantically invalid, 429 rate-limited) rather than 400-for-everything or, worse, 200-with- ' +
    'an-error-in-the-body? Are 5xx reserved for genuine server faults, never used to report a ' +
    'caller mistake? Watch for: a 200 whose body says `{"error": …}`; a 500 that is really a 400; ' +
    'a 401/403 confusion (is the caller unauthenticated or merely forbidden?); a create that ' +
    'returns 200 with no Location. When codes are correct, a client handles the API generically.',
  appliesTo: ['*'],
  source: 'RFC 9110 (HTTP status codes) + Zalando RESTful API Guidelines (status codes)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
