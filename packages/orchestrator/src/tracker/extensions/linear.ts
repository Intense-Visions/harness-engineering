import { Result, Ok } from '@harness-engineering/types';

/**
 * Interface for Linear GraphQL tool extension.
 * This is a stub implementation for Phase 4.
 */
export interface LinearGraphQLExtension {
  query(query: string, variables?: Record<string, unknown>): Promise<Result<unknown, Error>>;
}

export class LinearGraphQLStub implements LinearGraphQLExtension {
  async query(
    query: string,
    _variables?: Record<string, unknown>
  ): Promise<Result<unknown, Error>> {
    console.log('Linear GraphQL query (stub):', query);
    return Ok({ data: {} });
  }
}
