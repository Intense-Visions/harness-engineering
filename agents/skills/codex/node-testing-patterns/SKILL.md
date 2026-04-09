# Node.js Testing Patterns

> Test Node.js APIs and modules using supertest, nock, and test containers

## When to Use

- Testing Express/Fastify API endpoints with real HTTP requests
- Mocking outbound HTTP requests to external services
- Running integration tests against real databases in containers
- Testing Node.js modules with file system or network dependencies

## Instructions

1. **Supertest for API endpoint testing:**

```typescript
import request from 'supertest';
import { app } from '../app';

describe('POST /api/users', () => {
  it('creates a user and returns 201', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@test.com' })
      .set('Authorization', `Bearer ${testToken}`)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Alice',
      email: 'alice@test.com',
    });
    expect(response.body.id).toBeDefined();
  });

  it('returns 400 for invalid input', async () => {
    const response = await request(app).post('/api/users').send({ name: '' }).expect(400);

    expect(response.body.errors).toBeDefined();
  });
});
```

2. **Nock for mocking external HTTP calls:**

```typescript
import nock from 'nock';

beforeEach(() => {
  nock('https://api.stripe.com')
    .post('/v1/charges')
    .reply(200, { id: 'ch_test', status: 'succeeded' });
});

afterEach(() => {
  nock.cleanAll();
});

it('processes payment through Stripe', async () => {
  const result = await paymentService.charge({
    amount: 1000,
    currency: 'usd',
    source: 'tok_visa',
  });

  expect(result.status).toBe('succeeded');
});
```

3. **Test containers for database integration:**

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

let container;
let prisma;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  process.env.DATABASE_URL = container.getConnectionUri();
  // Run migrations
  prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(migrationSQL);
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

afterEach(async () => {
  await prisma.user.deleteMany();
});
```

4. **Test file system operations** with temporary directories:

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'test-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

it('writes and reads config file', async () => {
  const configPath = join(tempDir, 'config.json');
  await writeConfig(configPath, { port: 3000 });
  const config = await readConfig(configPath);
  expect(config.port).toBe(3000);
});
```

5. **Test with dependency injection:**

```typescript
// Service accepts dependencies as constructor params
class UserService {
  constructor(
    private db: Database,
    private emailClient: EmailClient
  ) {}

  async createUser(data: CreateUserInput) {
    const user = await this.db.user.create(data);
    await this.emailClient.sendWelcome(user.email);
    return user;
  }
}

// In tests: inject mocks
it('sends welcome email on user creation', async () => {
  const mockEmail = { sendWelcome: vi.fn() };
  const service = new UserService(testDb, mockEmail);

  await service.createUser({ name: 'Alice', email: 'alice@test.com' });

  expect(mockEmail.sendWelcome).toHaveBeenCalledWith('alice@test.com');
});
```

6. **Nock with request matching:**

```typescript
nock('https://api.example.com')
  .get('/users')
  .query({ role: 'admin' })
  .matchHeader('Authorization', /Bearer .+/)
  .reply(200, [{ id: '1', name: 'Admin' }]);
```

7. **Verify all mocked requests were called:**

```typescript
afterEach(() => {
  if (!nock.isDone()) {
    nock.cleanAll();
    throw new Error('Not all nock interceptors were used');
  }
});
```

## Details

Node.js testing involves testing HTTP APIs, external service integrations, file operations, and database queries. The strategy combines supertest (HTTP testing), nock (HTTP mocking), and test containers (database isolation).

**Supertest:** Creates an in-process HTTP connection to your Express/Fastify app without starting a real server. This is faster and more reliable than making real HTTP requests to a running server.

**Nock:** Intercepts HTTP requests made by `http`/`https`/`fetch` and returns configured responses. Unlike MSW, nock operates at the Node.js HTTP module level, not the network level.

**Nock vs MSW:** Nock patches Node.js HTTP internals; MSW uses a service worker (browser) or interceptor (Node). MSW is better for testing code that uses `fetch`; nock is better for code that uses `http`/`https` directly.

**Trade-offs:**

- Supertest tests the full middleware stack — but requires the app to be importable as a module
- Nock isolates external services — but tightly couples tests to request shapes
- Test containers provide real database behavior — but add 5-15 seconds of startup time
- Dependency injection enables easy mocking — but requires structuring code for injectability

## Source

https://vitest.dev/guide/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
