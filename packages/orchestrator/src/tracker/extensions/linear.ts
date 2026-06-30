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

/** Normalize an unknown thrown value into a human-readable message. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
    const sent = await this.sendRequest(query, variables);
    if (!sent.ok) return sent;
    const res = sent.value;

    if (!res.ok) {
      return Err(await this.httpError(res));
    }

    const parsed = await this.parseEnvelope(res);
    if (!parsed.ok) return parsed;
    const envelope = parsed.value;

    const graphqlError = envelopeError(envelope);
    if (graphqlError) return Err(graphqlError);

    return Ok(envelope.data ?? {});
  }

  /** POST the operation to Linear, normalizing transport throws into an `Err`. */
  private async sendRequest(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<Result<Response, Error>> {
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      });
      return Ok(res);
    } catch (err) {
      return Err(new Error(`Linear GraphQL request failed: ${errorMessage(err)}`));
    }
  }

  /** Build the error for a non-2xx HTTP response, including a truncated body. */
  private async httpError(res: Response): Promise<Error> {
    const body = await res.text().catch(() => '');
    const detail = body ? `: ${body.slice(0, 500)}` : '';
    return new Error(`Linear GraphQL HTTP ${res.status}${detail}`);
  }

  /** Parse the JSON envelope, normalizing parse failures into an `Err`. */
  private async parseEnvelope(res: Response): Promise<Result<GraphQLEnvelope, Error>> {
    try {
      return Ok((await res.json()) as GraphQLEnvelope);
    } catch (err) {
      return Err(new Error(`Linear GraphQL response was not valid JSON: ${errorMessage(err)}`));
    }
  }
}

/** Build a combined error from a GraphQL `errors` array, or `undefined` if none. */
function envelopeError(envelope: GraphQLEnvelope): Error | undefined {
  if (!envelope.errors || envelope.errors.length === 0) return undefined;
  const message = envelope.errors.map((e) => e.message ?? 'unknown error').join('; ');
  return new Error(`Linear GraphQL error: ${message}`);
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
