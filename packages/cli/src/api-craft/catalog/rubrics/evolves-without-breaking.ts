import type { ApiRubric } from './types.js';

export const evolvesWithoutBreakingRubric: ApiRubric = {
  id: 'API-R009',
  title: 'Evolves without breaking consumers',
  description:
    'An API is a promise to code you do not control; the design must let it grow without breaking ' +
    'that promise. Ask: is there a clear versioning strategy for breaking changes (a version in ' +
    'the path or a dated version header), and are non-breaking changes made ADDITIVELY (new ' +
    'optional fields, new endpoints) rather than by repurposing existing ones? Are responses ' +
    'tolerant-reader-friendly — enums and shapes that can gain members without a client crashing, ' +
    'optional fields that stay optional? Is a field ever removed or a type narrowed silently ' +
    'within a version? Watch for: a breaking change shipped in place with no version bump; an ' +
    'enum a client is told to switch exhaustively on that will later gain values; a required ' +
    'request field added to an existing endpoint; a field renamed rather than added-and- ' +
    'deprecated. Stripe’s dated API versions set the bar for evolving without breaking callers.',
  appliesTo: ['*'],
  source: 'Stripe API versioning + Zalando RESTful API Guidelines (compatibility)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
