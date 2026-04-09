# NestJS Module Pattern

> Organize NestJS applications with cohesive feature modules, controlled exports, and composable dynamic configurations

## When to Use

- Starting a new NestJS feature and deciding where to place providers, controllers, and services
- Sharing providers between modules without creating circular dependencies
- Building reusable library modules that accept configuration (e.g., a database module, auth module)
- Registering global utilities (guards, interceptors, pipes) that should apply application-wide

## Instructions

1. Create one module per feature domain (e.g., `UsersModule`, `OrdersModule`, `AuthModule`). Group the controller, service, and repository for that domain inside it.
2. Declare every provider in the `providers` array of the module that owns it. Only add it to `exports` when another module needs to inject it.
3. Import a module to gain access to its exported providers — never directly import a provider from another module's file.
4. Use `@Global()` sparingly: only for truly cross-cutting utilities (logging, config, event bus). Overuse destroys encapsulation.
5. Implement `forRoot()` / `forFeature()` static methods for modules that need external configuration:

```typescript
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DATABASE_OPTIONS, useValue: options }, DatabaseService],
      exports: [DatabaseService],
      global: true,
    };
  }
}
```

6. Use `forFeature()` for per-feature registration (e.g., registering Prisma models or TypeORM repositories for a specific module).
7. Keep `AppModule` thin — it should only import feature modules and global infrastructure modules, not declare providers directly.
8. Avoid circular module dependencies. If two modules need each other's providers, extract the shared logic into a third `SharedModule`.

## Details

NestJS modules are the primary unit of application organization. They enforce explicit dependency declaration: a module cannot use a provider unless it either declares it internally or imports a module that exports it. This makes dependency graphs auditable and prevents accidental coupling.

**Module anatomy:**

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([User])], // modules whose exports you need
  controllers: [UsersController], // route handlers scoped to this module
  providers: [UsersService, UsersRepository], // services, repos, guards, etc.
  exports: [UsersService], // what other modules may inject
})
export class UsersModule {}
```

**Dynamic modules** solve the configuration problem. A static module cannot accept runtime configuration; `forRoot()` returns a `DynamicModule` object that NestJS treats identically to a static module but allows passing options:

```typescript
// In AppModule:
DatabaseModule.forRoot({ url: process.env.DATABASE_URL });
```

**Global modules** (`@Global()`) register their exports into every module without requiring an explicit `imports` declaration. Use this for config, logging, and event buses — not for business-logic services where explicit imports communicate intent.

**Shared modules** are a common pattern for breaking circular dependencies. Extract the shared provider into its own module, export it, and import `SharedModule` from both dependents.

**Trade-offs:**

- Explicit imports are verbose but make coupling visible at a glance
- Global modules reduce boilerplate but hide dependencies — use them only for infrastructure
- Dynamic modules enable reusability but add complexity; prefer static modules until reuse is needed

## Source

https://docs.nestjs.com/modules

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
