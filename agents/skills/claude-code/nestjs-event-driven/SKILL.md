# NestJS Event-Driven Pattern

> Build event-driven systems with EventEmitter2, CQRS module, CommandBus, and QueryBus

## When to Use

- You need to decouple side effects (send email, update audit log) from the primary operation
- You are implementing CQRS to separate read and write models for a bounded context
- You need event sourcing where domain events are the source of truth
- You want to publish domain events that multiple services can independently handle

## Instructions

### EventEmitter2 (simple pub/sub within the same process)

1. **Setup:**

```bash
npm install @nestjs/event-emitter
```

```typescript
@Module({ imports: [EventEmitterModule.forRoot()] })
export class AppModule {}
```

2. **Emit events from a service:**

```typescript
@Injectable()
export class UsersService {
  constructor(private eventEmitter: EventEmitter2) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = await this.prisma.user.create({ data: dto });
    this.eventEmitter.emit('user.created', new UserCreatedEvent(user));
    return user;
  }
}
```

3. **Handle events:**

```typescript
@Injectable()
export class EmailNotificationListener {
  @OnEvent('user.created')
  async handleUserCreated(event: UserCreatedEvent): Promise<void> {
    await this.mailService.sendWelcomeEmail(event.user.email);
  }

  @OnEvent('user.*') // wildcard
  async handleAnyUserEvent(event: unknown): Promise<void> { ... }
}
```

### CQRS Module (commands and queries)

```typescript
npm install @nestjs/cqrs
```

```typescript
// command
export class CreateUserCommand { constructor(public dto: CreateUserDto) {} }

// handler
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(private usersRepo: UsersRepository) {}
  async execute(command: CreateUserCommand): Promise<User> {
    return this.usersRepo.create(command.dto);
  }
}

// dispatch from controller
@Post()
create(@Body() dto: CreateUserDto) {
  return this.commandBus.execute(new CreateUserCommand(dto));
}

// query
@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  async execute(query: GetUserQuery): Promise<User> {
    return this.usersReadRepo.findById(query.id);
  }
}
```

Register all handlers in `providers`.

## Details

**EventEmitter2 vs CQRS:** EventEmitter2 is in-process pub/sub — simple, zero setup overhead, good for side effects. CQRS is a structural pattern that separates commands (writes) from queries (reads) — use it when you need independent scaling of read/write paths or when the read model differs significantly from the write model.

**EventEmitter2 async handlers:** `@OnEvent('user.created', { async: true })` ensures async handlers do not block the event loop. Set `promisify: true` on `EventEmitterModule.forRoot()` to await async handlers before continuing.

**EventBus (CQRS):** In addition to `CommandBus` and `QueryBus`, the CQRS module provides `EventBus` for domain events. `IEventHandler` implementations react to events published via `eventBus.publish(new UserCreatedEvent(user))`.

**Saga pattern:** `@nestjs/cqrs` supports long-running processes via `@Saga()` decorator — these are RxJS streams that react to events and dispatch commands.

**Cross-service events:** EventEmitter2 is in-process only. For cross-service messaging (microservices), use the NestJS microservices transport layer (`@EventPattern`, Redis/RabbitMQ) or integrate with Kafka/NATS for durable event streams.

## Source

https://docs.nestjs.com/recipes/cqrs

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
