/**
 * Living catalog (ADR 0020) — curated API exemplars for api-craft.
 *
 * These are REFERENCE POINTS, not fabricated content: each entry names a real,
 * publicly documented API and states the single quality dimension it best
 * exemplifies. They ground the rubric catalog (so a critique can cite "the bar
 * Stripe sets for idempotent requests") and seed a future BENCHMARK phase — the
 * direct analogue of cli-ergonomics-craft's and docs-craft's exemplar corpus.
 * No exemplar payload is reproduced.
 *
 * v1 is CRITIQUE-only; the exemplar set exists to anchor rubric sources and to
 * give the growth catalog a place to accrete.
 */

export interface ApiExemplar {
  /** Stable id in the api-craft exemplar namespace. */
  id: string;
  /** Human name of the API. */
  name: string;
  /** Public documentation URL. */
  url: string;
  /** The one API-quality dimension this API best exemplifies. */
  exemplifies: string;
  /** Which seed rubric ids this exemplar most directly anchors. */
  anchors: ReadonlyArray<string>;
}

export const SEED_EXEMPLARS: ReadonlyArray<ApiExemplar> = [
  {
    id: 'stripe-api',
    name: 'Stripe API',
    url: 'https://docs.stripe.com/api',
    exemplifies:
      'Resources that model the business domain, typed error objects that tell the caller exactly ' +
      'what to do, an Idempotency-Key contract for safe retries, cursor pagination, and dated ' +
      'versioning that evolves without breaking consumers.',
    anchors: ['API-R001', 'API-R005', 'API-R007', 'API-R008', 'API-R009'],
  },
  {
    id: 'linear-graphql',
    name: 'Linear GraphQL API',
    url: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
    exemplifies:
      'A schema whose types mirror the product’s domain concepts one-to-one, with consistent, ' +
      'predictable node shapes and connection-based pagination.',
    anchors: ['API-R001', 'API-R006', 'API-R007'],
  },
  {
    id: 'github-rest',
    name: 'GitHub REST API',
    url: 'https://docs.github.com/en/rest',
    exemplifies:
      'A uniform, guessable resource path grammar with honest HTTP methods and correct status ' +
      'codes across a very large surface.',
    anchors: ['API-R002', 'API-R003', 'API-R004'],
  },
  {
    id: 'resend-api',
    name: 'Resend API',
    url: 'https://resend.com/docs/api-reference',
    exemplifies:
      'A small, focused resource surface at exactly the right abstraction, with predictable ' +
      'request/response shapes a newcomer can guess on the first try.',
    anchors: ['API-R001', 'API-R006'],
  },
  {
    id: 'anthropic-api',
    name: 'Anthropic API',
    url: 'https://docs.anthropic.com/en/api',
    exemplifies:
      'Honest methods and status codes, a consistent typed error contract, and additive, ' +
      'versioned evolution that keeps existing integrations working.',
    anchors: ['API-R003', 'API-R004', 'API-R005', 'API-R009'],
  },
];
