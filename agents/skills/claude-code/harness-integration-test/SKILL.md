# Harness Integration Test

> Service boundary testing, API contract verification, and consumer-driven contract validation. Ensures services communicate correctly without requiring full end-to-end infrastructure.

## When to Use

- Testing API endpoints with real HTTP requests against a running service
- Validating consumer-driven contracts between microservices (Pact, Spring Cloud Contract)
- Verifying database interactions through repository or data access layers
- NOT when testing pure business logic with no I/O (use unit tests or harness-tdd instead)
- NOT when testing full user flows through a browser (use harness-e2e instead)
- NOT when performing load or stress testing on APIs (use harness-load-testing instead)

## Process

### Phase 1: DISCOVER -- Map Service Boundaries and Dependencies

1. **Identify service boundaries.** Scan the project structure for:
   - API route definitions (Express routers, FastAPI endpoints, Spring controllers, Go HTTP handlers)
   - Service client code (HTTP clients, gRPC stubs, message queue publishers/consumers)
   - Shared type definitions or API schemas (OpenAPI specs, proto files, GraphQL schemas)

2. **Map inter-service dependencies.** For each service, catalog:
   - Upstream dependencies: services this service calls
   - Downstream consumers: services that call this service
   - Shared resources: databases, message queues, caches

3. **Inventory existing integration tests.** Glob for test files in `tests/integration/`, `__integration__/`, `tests/api/`, and `contract-tests/`. Classify by type:
   - API tests: send HTTP requests and assert responses
   - Contract tests: verify provider/consumer agreements
   - Repository tests: test data access against a real database

4. **Identify coverage gaps.** Cross-reference discovered endpoints and service boundaries against existing tests. Flag untested:
   - API endpoints with no request/response validation
   - Service boundaries with no contract tests
   - Error scenarios (4xx responses, timeout handling, retry behavior)

5. **Select test strategy.** Based on the architecture:
   - Monolith: API tests with supertest/httptest against the running application
   - Microservices: consumer-driven contract tests with Pact plus API tests per service
   - Event-driven: message contract tests plus async handler integration tests

### Phase 2: MOCK -- Configure Test Doubles and Infrastructure

1. **Set up test database.** Choose the appropriate strategy:
   - **Testcontainers:** Spin up a real database in Docker for each test suite. Preferred for PostgreSQL, MySQL, MongoDB.
   - **In-memory database:** SQLite in-memory for lightweight tests. Only when schema compatibility is confirmed.
   - **Transaction rollback:** Wrap each test in a transaction and roll back. Fast but requires careful connection management.

2. **Configure mock services for external dependencies.** For each upstream dependency:
   - Create a mock server using the framework's built-in tools (Pact mock, WireMock, nock, MSW)
   - Define request/response pairs from the API contract or OpenAPI spec
   - Configure realistic error responses (500, 503, timeout) for error path testing

3. **Set up contract broker (if using Pact).** Configure:
   - Pact broker URL and authentication
   - Consumer and provider version tagging strategy
   - Webhook configuration for provider verification on deploy

4. **Create test fixtures and seed data.** Generate:
   - Database seed scripts for required reference data
   - Request/response fixtures for common API payloads
   - Factory functions for building test entities with sensible defaults

5. **Verify mock infrastructure starts.** Run a smoke test that:
   - Starts the test database and confirms connectivity
   - Starts mock services and confirms they respond
   - Seeds baseline data and confirms it is queryable

### Phase 3: IMPLEMENT -- Write Integration Tests

1. **Write API endpoint tests.** For each endpoint, test:
   - Happy path: valid request returns expected response with correct status code and body
   - Validation: invalid input returns 400 with descriptive error messages
   - Authentication: unauthenticated requests return 401, unauthorized return 403
   - Not found: requests for non-existent resources return 404
   - Edge cases: empty collections, pagination boundaries, large payloads

2. **Write consumer-driven contract tests (when applicable).** For each consumer-provider pair:
   - Consumer side: define interactions (request/response pairs) the consumer expects
   - Provider side: verify the provider satisfies all consumer contracts
   - Use Pact matchers for flexible verification (type matching, regex, array-like)

3. **Write repository/data access tests.** For each data access layer:
   - CRUD operations with valid data
   - Constraint violations (unique, foreign key, not-null)
   - Query correctness (filters, sorting, pagination)
   - Transaction behavior (isolation, rollback on error)

4. **Write error handling and resilience tests.** Verify:
   - Timeout behavior: service responds within SLA when dependency is slow
   - Retry logic: transient failures trigger retries with backoff
   - Circuit breaker: repeated failures open the circuit and return fallback
   - Graceful degradation: partial dependency failure does not crash the service

5. **Organize tests by execution speed.** Tag or separate:
   - Fast integration tests (in-memory mocks, < 5 seconds): run on every commit
   - Slow integration tests (testcontainers, external services, > 5 seconds): run on PR

### Phase 4: VALIDATE -- Execute and Verify Contract Compliance

1. **Run the full integration test suite.** Execute all tests with verbose output. Collect:
   - Pass/fail counts per test category (API, contract, repository)
   - Execution time per test and per suite
   - Any tests that require external services to be running

2. **Verify contract compliance.** If using Pact:
   - Publish consumer pacts to the broker
   - Run provider verification against published pacts
   - Confirm the can-i-deploy check passes for the target environment

3. **Validate test isolation.** Run tests in random order (if the framework supports it). Any test that fails only when run after a specific other test has a shared-state bug. Fix immediately.

4. **Run `harness validate`.** Confirm the project passes all harness checks including the new integration test infrastructure.

5. **Generate coverage report.** Summarize:
   - Endpoints tested vs. total endpoints discovered
   - Contract coverage: consumer-provider pairs with verified contracts
   - Error scenarios covered vs. identified
   - Recommended next steps for remaining gaps

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in VALIDATE phase after all integration tests are implemented. Confirms project-wide health.
- **`harness check-deps`** -- Run after MOCK phase to verify test infrastructure dependencies do not leak into production bundles.
- **`emit_interaction`** -- Used at checkpoints to present contract verification results and coverage gaps to the human.
- **Grep** -- Used in DISCOVER phase to find route definitions, HTTP client usage, and service boundary patterns.
- **Glob** -- Used to catalog existing integration tests and contract files.

## Success Criteria

- Every API endpoint has at least one integration test covering the happy path
- Every consumer-provider boundary has a verified contract (when using microservices)
- Error scenarios (400, 401, 403, 404, 500, timeout) are tested for all public endpoints
- All integration tests pass with test doubles -- no dependency on external staging environments for CI
- Test isolation is verified: tests pass in any execution order
- `harness validate` passes with the integration test suite in place

## Examples

### Example: Express API with Supertest and Testcontainers

**DISCOVER output:**

```
Framework: Express 4.18 with TypeScript
Database: PostgreSQL via Prisma
Endpoints: 14 routes across 4 controllers (users, projects, tasks, auth)
Existing tests: 3 integration tests in tests/integration/ (auth only)
Coverage gaps: projects CRUD, tasks filtering, user profile update
```

**IMPLEMENT -- API endpoint test with supertest:**

```typescript
// tests/integration/projects.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createTestUser, generateAuthToken } from '../helpers/auth';

describe('POST /api/projects', () => {
  let authToken: string;

  beforeAll(async () => {
    const user = await createTestUser(prisma);
    authToken = generateAuthToken(user.id);
  });

  afterAll(async () => {
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
  });

  it('creates a project with valid data', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test Project', description: 'Integration test' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Test Project',
      description: 'Integration test',
    });
    expect(response.body.id).toBeDefined();
  });

  it('returns 400 when name is missing', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ description: 'No name' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual(expect.objectContaining({ field: 'name' }));
  });

  it('returns 401 without auth token', async () => {
    const response = await request(app).post('/api/projects').send({ name: 'Unauthorized' });

    expect(response.status).toBe(401);
  });
});
```

### Example: Pact Consumer-Driven Contract Test

**IMPLEMENT -- Consumer side (frontend):**

```typescript
// contract-tests/consumer/project-service.pact.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { ProjectClient } from '../../src/clients/project-client';

const { like, eachLike, uuid } = MatchersV3;

const provider = new PactV3({
  consumer: 'Dashboard',
  provider: 'ProjectService',
});

describe('ProjectService contract', () => {
  it('returns a list of projects', async () => {
    await provider
      .given('projects exist for user')
      .uponReceiving('a request for user projects')
      .withRequest({
        method: 'GET',
        path: '/api/projects',
        headers: { Authorization: like('Bearer token-123') },
      })
      .willRespondWith({
        status: 200,
        body: eachLike({
          id: uuid(),
          name: like('Project Alpha'),
          createdAt: like('2026-01-15T10:30:00Z'),
        }),
      })
      .executeTest(async (mockServer) => {
        const client = new ProjectClient(mockServer.url);
        const projects = await client.listProjects('token-123');
        expect(projects).toHaveLength(1);
        expect(projects[0].name).toBe('Project Alpha');
      });
  });
});
```

## Rationalizations to Reject

| Rationalization                                                                           | Why It Is Wrong                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Testing the happy path is sufficient -- error scenarios are edge cases"                  | The success criteria require error scenarios (400, 401, 403, 404, 500, timeout) for all public endpoints. Error paths are where real-world failures happen. |
| "We can test against the staging environment instead of setting up local mocks"           | No integration tests that require external staging environments for CI. Tests must run with local test doubles.                                             |
| "The consumer contract changed, so I will update the consumer test to match the provider" | Contract changes must be coordinated. The provider may have introduced a bug, not an intentional change.                                                    |
| "Tests pass when I run them in order, so they are fine"                                   | Phase 4 requires running tests in random order. Any test that fails only in a specific order has a shared-state bug.                                        |

## Gates

- **No integration tests that require external staging environments for CI.** Every integration test must run with local test doubles (mocks, containers, in-memory databases). Tests that fail without a staging VPN are not integration tests -- they are environment tests.
- **No shared mutable state between tests.** Each test must set up and tear down its own data. If tests fail when run in random order, shared state exists. Fix it before proceeding.
- **No testing implementation details.** Integration tests assert on API contracts (status codes, response shapes, headers) and observable data changes -- not on internal function calls or database column values that are not part of the public contract.
- **Contract changes must be coordinated.** If a provider contract test reveals a breaking change, do not silently update the consumer expectation. Flag it as a coordination point between teams.

## Escalation

- **When a service dependency has no API documentation or schema:** Cannot write accurate contract tests without knowing the contract. Escalate to the dependency team to provide an OpenAPI spec, proto file, or at minimum a Pact broker with published contracts.
- **When Testcontainers fails in CI (Docker-in-Docker issues, resource limits):** Fall back to in-memory alternatives where possible. For databases that have no in-memory mode, escalate to DevOps to configure CI runners with Docker support.
- **When contract verification fails on the provider side:** This indicates a real incompatibility between consumer expectations and provider implementation. Do not adjust the consumer test to match the provider bug. Escalate to the provider team with the failing interaction details.
- **When integration tests exceed 5 minutes for a single service:** Triage by separating fast tests (mocked dependencies) from slow tests (testcontainers). Run fast tests on every commit, slow tests on PR only.
