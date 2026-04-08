# Test Integration Patterns

> Write integration tests that exercise real dependencies using test databases and containers

## When to Use

- Testing service layers with real database connections
- Verifying API endpoint behavior with actual HTTP requests
- Testing multi-component workflows end-to-end within the backend
- Validating that modules work correctly when integrated together

## Instructions

1. **Use a test database** — run a real database for integration tests:

```typescript
// test/setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});

beforeEach(async () => {
  // Clean tables in dependency order
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
```

2. **Test containers** for disposable databases:

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  process.env.DATABASE_URL = container.getConnectionUri();
  // Run migrations
  await execSync('npx prisma migrate deploy');
}, 60_000); // Container startup timeout

afterAll(async () => {
  await container.stop();
});
```

3. **Test API endpoints** with supertest or the framework's test client:

```typescript
import request from 'supertest';
import { app } from '../app';

describe('POST /api/users', () => {
  it('creates a user and returns 201', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@test.com' })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Alice',
      email: 'alice@test.com',
    });
    expect(response.body.id).toBeDefined();
  });

  it('returns 400 for invalid email', async () => {
    await request(app).post('/api/users').send({ name: 'Alice', email: 'invalid' }).expect(400);
  });
});
```

4. **Transaction-based isolation** — wrap each test in a transaction that rolls back:

```typescript
import { prisma } from './setup';

let tx: PrismaClient;

beforeEach(async () => {
  // Start a transaction for test isolation
  // Each test sees a clean state without deleting data
  await prisma.$executeRaw`BEGIN`;
});

afterEach(async () => {
  await prisma.$executeRaw`ROLLBACK`;
});
```

5. **Test service layer with real dependencies:**

```typescript
describe('OrderService', () => {
  it('creates order and deducts inventory', async () => {
    // Arrange — seed test data
    const product = await prisma.product.create({
      data: { name: 'Widget', stock: 10, price: 9.99 },
    });

    const service = new OrderService(prisma);

    // Act
    const order = await service.createOrder({
      items: [{ productId: product.id, quantity: 3 }],
      userId: testUser.id,
    });

    // Assert — verify both order creation AND inventory deduction
    expect(order.total).toBe(29.97);

    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(updatedProduct!.stock).toBe(7);
  });
});
```

6. **Use factory helpers** for test data:

```typescript
async function createTestUser(overrides?: Partial<User>) {
  return prisma.user.create({
    data: {
      email: `test-${crypto.randomUUID()}@test.com`,
      name: 'Test User',
      ...overrides,
    },
  });
}
```

7. **Separate test configuration:**

```typescript
// vitest.config.integration.ts
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    setupFiles: ['./test/integration-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
```

Run with: `vitest --config vitest.config.integration.ts`

## Details

Integration tests verify that multiple components work together correctly. They catch issues that unit tests miss — serialization bugs, query errors, constraint violations, and middleware ordering problems.

**Test database strategies:**

- **Shared test database** — fast setup, requires cleanup between tests. Best for local development
- **Test containers** — disposable per-suite database. Slower startup but perfect isolation. Best for CI
- **SQLite in-memory** — fastest but behavior may differ from production database (PostgreSQL, MySQL)

**Data isolation approaches:**

- **Delete-and-reseed** — simple but slow for large datasets. Use `deleteMany` in reverse dependency order
- **Transaction rollback** — fast, no data ever written. But cannot test transaction behavior itself
- **Separate schemas/databases** — full isolation per test suite. Slowest setup but safest

**Integration vs E2E:** Integration tests exercise the backend (service + database) without a browser. E2E tests include the full stack (browser + backend + database). Integration tests are faster and more focused.

**Trade-offs:**

- Real databases catch real bugs (constraint violations, query errors) — but are slower than mocked tests
- Test containers provide perfect isolation — but add 5-15 seconds of startup time per suite
- Transaction rollback is fast — but prevents testing transaction behavior and concurrent access
- Integration tests catch more bugs per test — but are harder to maintain and debug when they fail

## Source

https://vitest.dev/guide/
