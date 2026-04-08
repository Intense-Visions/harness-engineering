# NestJS Service Pattern

> Encapsulate business logic in @Injectable services with repository pattern separation

## When to Use

- You are implementing business logic that should be reusable across multiple controllers
- You need to interact with a database, external API, or message queue from your application layer
- You want to separate data access concerns (repository) from business rules (service)
- You are writing unit tests and need to mock data access without touching the database

## Instructions

1. Decorate the class with `@Injectable()`. This registers it as a provider that the DI container can instantiate and inject.
2. Declare the service in the `providers` array of its module. Export it if other modules need to inject it.
3. Inject dependencies through the constructor using TypeScript types — NestJS uses reflection metadata to resolve them.
4. Keep one service per domain aggregate (e.g., `UsersService`, `OrdersService`). Avoid `AppService` catch-alls.
5. Apply the repository pattern: have the service call a repository (or Prisma/TypeORM directly) rather than embedding query logic inline.
6. Throw `HttpException` subclasses (`NotFoundException`, `ConflictException`, etc.) for domain errors so exception filters can serialize them correctly.

```typescript
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    return this.prisma.user.create({ data: dto });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findOne(id); // reuse findOne for existence check
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }
}
```

7. Use `async/await` for all async operations. Do not mix callbacks and promises.
8. Keep methods focused — a method does one thing. Extract helpers for repeated logic.

## Details

Services are the workhorses of NestJS applications. They are singleton-scoped by default (one instance shared across the entire app lifetime), which means you should not store per-request state in service instance variables.

**Scope options:** `@Injectable({ scope: Scope.REQUEST })` creates a new instance per request — useful for request-scoped data (e.g., tenant ID) but has a performance cost since the entire dependency chain must be request-scoped. Use the default `DEFAULT` (singleton) scope unless you have a concrete reason not to.

**Repository pattern with Prisma:** Rather than calling `prisma.user` everywhere in a service, some teams create a `UsersRepository` class that wraps Prisma calls and exposes domain-level methods (`findByEmail`, `findActiveUsers`). This makes the service easier to test and the data access logic easier to swap.

**Error boundaries:** Only throw HTTP exceptions in the service if it is HTTP-facing. For domain services shared between HTTP and microservice transports, throw domain-specific exceptions and convert them to `RpcException` or `HttpException` at the transport layer.

**Circular dependency between services:** When `ServiceA` depends on `ServiceB` and vice versa, inject with `forwardRef()`: `@Inject(forwardRef(() => ServiceB)) private serviceB: ServiceB`. Prefer refactoring to a shared third service instead.

## Source

https://docs.nestjs.com/providers
