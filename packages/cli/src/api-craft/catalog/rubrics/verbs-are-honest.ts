import type { ApiRubric } from './types.js';

export const verbsAreHonestRubric: ApiRubric = {
  id: 'API-R003',
  title: 'HTTP methods are honest',
  description:
    'The method must mean what HTTP says it means, because clients, caches, and proxies rely on ' +
    'that contract. Ask: is GET truly safe and side-effect-free (never mutating state, never ' +
    'used to trigger an action because a body felt inconvenient)? Does POST create or run a ' +
    'non-idempotent action, while PUT replaces and PATCH partially updates — each used for its ' +
    'own job rather than POST-for-everything? Is DELETE actually a delete? Watch for: a GET that ' +
    'writes; a POST used to fetch because the query got long (use a documented search endpoint or ' +
    'body-on-POST-search deliberately, not by accident); PUT and PATCH used interchangeably; an ' +
    'action smuggled into a verb it does not fit. When the method is honest, a caller predicts ' +
    'retry-safety and caching behavior without reading prose.',
  appliesTo: ['*'],
  source: 'RFC 9110 (HTTP Semantics — method properties: safe, idempotent)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
