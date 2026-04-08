# NestJS Dependency Injection

> Master NestJS DI container with tokens, useClass/useValue/useFactory providers

## When to Use

- You need to provide an interface implementation that is swappable (e.g., a real database vs. an in-memory mock)
- You need to inject a plain value (config object, constant, SDK client instance) that is not a class
- You need to run async initialization before a provider is usable (factory providers with async/await)
- You want to understand why "Cannot resolve dependencies" errors occur

## Instructions

1. **Standard provider (shorthand):** `providers: [MyService]` — NestJS creates one singleton instance, injected by class type.

2. **useClass — swap implementations:**

```typescript
providers: [
  { provide: MyService, useClass: process.env.NODE_ENV === 'test' ? MockMyService : MyService },
];
```

3. **useValue — inject constants or SDK clients:**

```typescript
export const STRIPE_CLIENT = 'STRIPE_CLIENT';

providers: [
  { provide: STRIPE_CLIENT, useValue: new Stripe(process.env.STRIPE_KEY!) }
]

// inject with @Inject token
constructor(@Inject(STRIPE_CLIENT) private stripe: Stripe) {}
```

4. **useFactory — async initialization:**

```typescript
providers: [
  {
    provide: DATABASE_CONNECTION,
    useFactory: async (config: ConfigService): Promise<DataSource> => {
      const ds = new DataSource({ url: config.get('DATABASE_URL') });
      await ds.initialize();
      return ds;
    },
    inject: [ConfigService],
  },
];
```

5. **InjectionToken vs string tokens:** Prefer `Symbol`-based or class-based tokens over plain strings to avoid collisions:

```typescript
export const MAIL_OPTIONS = new InjectionToken<MailOptions>('MailOptions');
```

6. **Inject in constructor with `@Inject(TOKEN)`** when the token is not a class:

```typescript
constructor(@Inject(MAIL_OPTIONS) private options: MailOptions) {}
```

7. **Optional injection:** Use `@Optional()` when a provider may not be registered: `constructor(@Optional() @Inject(CACHE) private cache?: Cache) {}`.

## Details

NestJS uses a hierarchical IoC container built on top of Reflect metadata. When you add a class to `providers`, the container reads its constructor parameter types via TypeScript's `emitDecoratorMetadata` and resolves each dependency recursively.

**Token resolution:** A provider token can be a class, a string, a Symbol, or an `InjectionToken<T>`. The container matches the `provide` key to the `@Inject()` token (or the constructor type for class providers). Mismatched tokens are the second most common DI error after missing exports.

**Scopes and singleton behavior:** Default (singleton) scope means `useFactory` runs once at app startup. `REQUEST` scope runs the factory (or constructor) per request — useful for per-request database connections or tenant-aware clients.

**Testing:** `overrideProvider(MyService).useValue(mockService)` in `Test.createTestingModule()` replaces any token with a mock without touching the module graph. This is the cleanest way to unit-test controllers and services.

**`ModuleRef.resolve()` for dynamic resolution:** When you need to resolve a provider at runtime (e.g., strategy pattern where the concrete implementation depends on runtime data), inject `ModuleRef` and call `moduleRef.resolve(SomeService)`.

## Source

https://docs.nestjs.com/fundamentals/custom-providers
