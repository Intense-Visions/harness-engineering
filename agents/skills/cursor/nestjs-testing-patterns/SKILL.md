# NestJS Testing Patterns

> Test NestJS apps with Test.createTestingModule, jest mocks, supertest e2e, and overrideProvider

## When to Use

- You are writing unit tests for a service and need to mock its dependencies
- You are writing integration tests for a controller and need to spin up a partial NestJS app
- You are writing e2e tests that exercise real HTTP requests against the running application
- You need to verify that guards, interceptors, or pipes behave correctly in context

## Instructions

1. **Unit test a service** — mock all dependencies:

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockDeep<PrismaClient>() }],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
  });

  it('throws NotFoundException when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });
});
```

2. **Integration test a controller** with overrideProvider:

```typescript
describe('UsersController (integration)', () => {
  let app: INestApplication;
  let usersService: jest.Mocked<UsersService>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    })
      .overrideProvider(UsersService)
      .useValue({ findOne: jest.fn(), create: jest.fn() })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    usersService = module.get(UsersService);
  });

  afterAll(() => app.close());

  it('GET /users/:id returns 200', async () => {
    usersService.findOne.mockResolvedValue({ id: '1', email: 'a@b.com' } as User);
    return request(app.getHttpServer()).get('/users/1').expect(200);
  });
});
```

3. **E2e test** against the real application:

```typescript
// test/app.e2e-spec.ts
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  it('POST /users returns 201', () => {
    return request(app.getHttpServer())
      .post('/users')
      .send({ email: 'test@example.com', password: 'password123' })
      .expect(201);
  });
});
```

4. **Mock a guard** in tests:

```typescript
.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
```

## Details

NestJS testing is built on Jest, with `@nestjs/testing` providing `Test.createTestingModule()` which creates an isolated module context — no HTTP server, no port binding. Providers, guards, pipes, and interceptors can all be selectively replaced.

**`overrideProvider` vs direct mock value:** `overrideProvider(Token).useValue(mock)` replaces the registered provider in the module without changing the module definition. This is cleaner than passing mock values in `providers` because it works even when the token is registered in an imported module.

**`mockDeep` from jest-mock-extended:** Prisma's generated client is deeply nested. `mockDeep<PrismaClient>()` creates a deep mock where every method is a `jest.fn()`. Pair with `{ provide: PrismaService, useValue: mockDeep<PrismaClient>() }`.

**Guard overrides:** `overrideGuard(MyGuard).useValue({ canActivate: () => true })` bypasses the guard entirely. To test the guard itself, instantiate it directly and call `canActivate()` with a mock `ExecutionContext`.

**`app.init()` vs `app.listen()`:** For supertest, call `app.init()` — it sets up the application without starting a TCP server. `supertest(app.getHttpServer())` binds directly to the HTTP handler.

**Test isolation:** Use `beforeEach` to recreate the module for unit tests (avoids state leakage between tests). Use `beforeAll` for e2e tests (app startup is expensive). Always call `app.close()` in `afterAll` to avoid open handle warnings.

## Source

https://docs.nestjs.com/fundamentals/testing

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
