import type { ApiRubric } from './types.js';

export const resourceModelsTheDomainRubric: ApiRubric = {
  id: 'API-R001',
  title: 'Resources model the domain, not the implementation',
  description:
    'A great API exposes the concepts a domain expert would recognize, at the right level of ' +
    'abstraction — not the database tables, the internal service boundaries, or the RPC verbs ' +
    'that happen to exist behind it. Ask: is each endpoint a noun the caller thinks in (a ' +
    'Payment, a Subscription, a PullRequest) rather than a procedure (`/processPaymentStep2`, ' +
    '`/getUserDataAndBillingJoin`)? Is the endpoint at the right granularity — not so chatty the ' +
    'caller must orchestrate five calls for one intent, not a god-endpoint that does unrelated ' +
    'things by mode flag? Does the shape hide implementation churn, so the same domain concept ' +
    'survives a rewrite of the storage layer? Watch for: table names leaking into paths; ' +
    'snake_case columns surfacing verbatim as fields; an endpoint whose name is a function call; ' +
    'a resource that exists only because a join was convenient. Stripe sets the bar: every ' +
    'resource is a business object, and the storage behind it is invisible.',
  appliesTo: ['*'],
  source: 'Fielding, REST dissertation (resource modeling) + Stripe API design principles',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
