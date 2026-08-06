import type { ApiRubric } from './types.js';

export const mutationsAreIdempotencyHonestRubric: ApiRubric = {
  id: 'API-R008',
  title: 'Mutations are idempotency-honest',
  description:
    'Networks retry; a mutation that is not idempotency-honest turns one retried request into two ' +
    'charges, two orders, two emails. This is a HANDLER-behavior concern — a declarative spec ' +
    'rarely captures it — so it is judged from route/handler code. Ask: for a non-idempotent ' +
    'create (POST), does the handler accept and honor an idempotency key so a client-side retry ' +
    'is safe, or does every retry create a duplicate? For PUT/PATCH/DELETE, is the implementation ' +
    'actually idempotent (applying it twice equals applying it once, and a second DELETE is not a ' +
    'hard 500)? Are unsafe side effects (charging, sending, provisioning) guarded against ' +
    'double-execution under concurrency or replay? Watch for: a create with no dedup path; ' +
    'a PATCH that appends instead of setting so replays accumulate; a DELETE that throws on an ' +
    'already-deleted resource; a webhook consumer with no replay protection. Stripe’s ' +
    'Idempotency-Key contract sets the bar.',
  appliesTo: ['route'],
  source: 'Stripe idempotent requests + RFC 9110 (idempotent methods)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
