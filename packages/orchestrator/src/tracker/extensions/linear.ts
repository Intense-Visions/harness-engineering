import { Result, Ok, Err } from '@harness-engineering/types';

/**
 * Interface for a Linear GraphQL tool extension — a thin authenticated client
 * over Linear's GraphQL API (https://linear.app/developers/graphql).
 */
export interface LinearGraphQLExtension {
  /**
   * Execute a GraphQL operation. Resolves to `Ok(data)` (the `data` object of
   * the GraphQL envelope) on success, or `Err` on a transport failure, a non-2xx
   * HTTP status, or a GraphQL `errors` array.
   */
  query(query: string, variables?: Record<string, unknown>): Promise<Result<unknown, Error>>;
}

const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';

export interface LinearGraphQLClientOptions {
  /**
   * Linear authentication token. A personal API key is sent verbatim in the
   * `Authorization` header; an OAuth access token must be passed already prefixed
   * with `Bearer ` (Linear's two supported schemes).
   */
  apiKey: string;
  /** Override the GraphQL endpoint (e.g. a proxy). Defaults to Linear's API. */
  endpoint?: string;
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

interface GraphQLEnvelope {
  data?: unknown;
  errors?: Array<{ message?: string }>;
}

/**
 * Real Linear GraphQL client. Replaces {@link LinearGraphQLStub}, which only
 * logged the query and returned an empty object. POSTs the operation to Linear's
 * GraphQL endpoint with the API key, and normalizes the three failure modes
 * (transport throw, non-2xx HTTP, GraphQL `errors`) into a single `Err`.
 */
export class LinearGraphQLClient implements LinearGraphQLExtension {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: LinearGraphQLClientOptions) {
    this.apiKey = opts.apiKey;
    this.endpoint = opts.endpoint ?? LINEAR_GRAPHQL_ENDPOINT;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  async query(query: string, variables?: Record<string, unknown>): Promise<Result<unknown, Error>> {
    let res: Response;
    try {
      res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      });
    } catch (err) {
      return Err(
        new Error(
          `Linear GraphQL request failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const detail = body ? `: ${body.slice(0, 500)}` : '';
      return Err(new Error(`Linear GraphQL HTTP ${res.status}${detail}`));
    }

    let envelope: GraphQLEnvelope;
    try {
      envelope = (await res.json()) as GraphQLEnvelope;
    } catch (err) {
      return Err(
        new Error(
          `Linear GraphQL response was not valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }

    if (envelope.errors && envelope.errors.length > 0) {
      const message = envelope.errors.map((e) => e.message ?? 'unknown error').join('; ');
      return Err(new Error(`Linear GraphQL error: ${message}`));
    }

    return Ok(envelope.data ?? {});
  }
}

/**
 * @deprecated Phase-4 placeholder retained for backward compatibility. It logs
 * the query and returns an empty object; use {@link LinearGraphQLClient} for a
 * real authenticated client.
 */
export class LinearGraphQLStub implements LinearGraphQLExtension {
  async query(
    query: string,
    _variables?: Record<string, unknown>
  ): Promise<Result<unknown, Error>> {
    console.log('Linear GraphQL query (stub):', query);
    return Ok({ data: {} });
  }
}
