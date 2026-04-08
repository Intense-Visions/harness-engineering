# Node.js Environment Config

> Manage environment configuration with process.env, dotenv, and validation for 12-factor apps

## When to Use

- Loading configuration from environment variables
- Validating that all required environment variables are present at startup
- Managing different configurations for development, staging, and production
- Following 12-factor app principles for configuration

## Instructions

1. **Load `.env` files** with `dotenv` (or Node.js 20.6+ built-in):

```typescript
// Node.js 20.6+: use --env-file flag
// node --env-file=.env app.js

// Or with dotenv package
import 'dotenv/config';
```

2. **Validate with Zod** at startup — fail fast on missing config:

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  API_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = EnvSchema.parse(process.env);
// Throws at startup if any required variable is missing or invalid
```

3. **Type-safe access** after validation:

```typescript
// env.PORT is number, env.DATABASE_URL is string
// No more process.env.PORT! (which is always string | undefined)
const server = app.listen(env.PORT);
```

4. **Structure `.env` files:**

```bash
# .env — defaults for local development (committed)
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# .env.local — local overrides and secrets (gitignored)
DATABASE_URL=postgresql://localhost:5432/myapp
API_KEY=dev-key-123
```

5. **Use `.env.example`** as documentation:

```bash
# .env.example — committed, shows all required variables
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
API_KEY=your-api-key-here
```

6. **Environment-specific configs:**

```typescript
const config = {
  development: {
    logLevel: 'debug',
    corsOrigin: '*',
  },
  production: {
    logLevel: 'info',
    corsOrigin: 'https://myapp.com',
  },
  test: {
    logLevel: 'error',
    corsOrigin: '*',
  },
}[env.NODE_ENV];
```

7. **Never hardcode secrets.** Use environment variables for:
   - Database connection strings
   - API keys and tokens
   - Encryption keys
   - Third-party service credentials

8. **Add to `.gitignore`:**

```
.env.local
.env.*.local
.env.production
```

## Details

The 12-factor app methodology recommends storing configuration in environment variables. This separates config from code and enables different configurations per deployment without code changes.

**`process.env` limitations:**

- All values are `string | undefined` — no numbers, booleans, or arrays
- Missing variables are `undefined`, not errors — code can run with missing config and fail later
- No validation — typos in variable names are silent

**Validation at startup** with Zod solves all three problems. The application fails immediately with a clear error message if any required variable is missing.

**Node.js 20.6+ `--env-file`:** Built-in `.env` loading without the `dotenv` package. Supports multiple files: `node --env-file=.env --env-file=.env.local app.js`.

**Trade-offs:**

- Env vars are simple and universal — but offer no structure (no nesting, no types)
- Zod validation catches issues at startup — but adds a dependency
- `.env` files are convenient for development — but should never be used in production (use the deployment platform's secrets management)
- `process.env` is global — consider dependency injection for testability

## Source

https://nodejs.org/api/process.html#processenv
