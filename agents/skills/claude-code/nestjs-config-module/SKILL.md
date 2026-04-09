# NestJS Config Module

> Manage environment config with ConfigModule.forRoot, ConfigService, and Joi schema validation

## When to Use

- You need to load environment variables from `.env` files and inject them into services
- You want to validate that required environment variables are present at startup (fail-fast)
- You need a typed configuration service instead of raw `process.env` access
- You want to organize configuration into namespaced sections (database, auth, mail)

## Instructions

1. **Install and register:**

```bash
npm install @nestjs/config
```

```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // no need to import in each module
      envFilePath: '.env', // default — loads .env
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        PORT: Joi.number().default(3000),
      }),
    }),
  ],
})
export class AppModule {}
```

2. **Inject ConfigService:**

```typescript
@Injectable()
export class DatabaseService {
  constructor(private config: ConfigService) {
    const url = this.config.get<string>('DATABASE_URL');
    const port = this.config.get<number>('PORT', 3000); // with default
  }
}
```

3. **Typed namespaced config** with `registerAs`:

```typescript
// config/database.config.ts
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS ?? '10'),
}));

// app.module.ts
ConfigModule.forRoot({ load: [databaseConfig] })

// inject
constructor(
  @InjectConfig('database') private dbConfig: ConfigType<typeof databaseConfig>
) {}
// or
this.config.get('database.url')
```

4. **Validate with Joi** (install separately: `npm install joi`):

```typescript
validationSchema: Joi.object({
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  PORT: Joi.number().port().default(3000),
});
```

5. **Multiple env files** for environment-specific configs:

```typescript
ConfigModule.forRoot({
  envFilePath: ['.env.local', '.env'], // .env.local takes precedence
});
```

## Details

`@nestjs/config` is a thin wrapper around the `dotenv` package with NestJS-specific integration: DI injection, module-level encapsulation, and schema validation.

**Fail-fast validation:** When a `validationSchema` is provided, `ConfigModule` validates all environment variables at application bootstrap. If required variables are missing or invalid, the process exits with a descriptive error before any service initializes. This prevents runtime errors from missing config deep in the request path.

**`isGlobal: true`:** Makes `ConfigModule` available to all modules without explicit import. Since configuration is genuinely app-wide, this is almost always correct. Register it once in `AppModule`.

**`ConfigService.get<T>()` typing:** The generic type is a hint only — TypeScript cannot verify that `process.env.PORT` is actually a number. Use `parseInt()` or the namespaced `registerAs()` approach with proper type coercion.

**Testing:** In tests, use `ConfigModule.forRoot({ envFilePath: '.env.test' })` or override with `{ provide: ConfigService, useValue: { get: jest.fn((key) => testValues[key]) } }`.

**Custom ConfigFactory pattern:** For complex scenarios (secret manager, remote config), implement a `ConfigFactory` function and return the config object from an async source. Use `ConfigModule.forRootAsync({ useFactory: ... })` with injected HTTP clients or secret manager SDKs.

## Source

https://docs.nestjs.com/techniques/configuration

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
