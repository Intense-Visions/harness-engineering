# Next.js Environment Configuration

> Manage environment variables, runtime config, and server-only module boundaries safely

## When to Use

- Configuring API keys, database URLs, and secrets for server-side code
- Exposing safe configuration values to the browser via `NEXT_PUBLIC_` prefix
- Validating environment variables at build time to catch misconfiguration early
- Preventing server-only secrets from leaking into the client bundle
- Configuring different behavior for development, staging, and production environments

## Instructions

1. Prefix environment variables with `NEXT_PUBLIC_` to expose them to the browser — all other variables are server-only.
2. Never put secrets (API keys, database URLs, private keys) in `NEXT_PUBLIC_` variables — they are inlined into the client bundle.
3. Use `t3-env` or `@t3-oss/env-nextjs` to validate environment variables at build time with Zod schemas.
4. Create `src/env.ts` (or `lib/env.ts`) as the single source of truth for env var access — import env values from here, never from `process.env` directly in components.
5. Add `import 'server-only'` to any module that accesses server-only env vars to prevent accidental client import.
6. Use `.env.local` for local development secrets — it is gitignored by default. Use `.env.development` and `.env.production` for non-secret environment-specific values.
7. Wrap `next.config.ts` with your env validation so the build fails immediately on missing required variables.
8. Access runtime environment variables in `next.config.ts` via `process.env` — variables set in hosting dashboards (Vercel, Railway) are available at runtime.

```typescript
// src/env.ts — validated env with t3-env
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(32),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
});

// lib/db.ts — import 'server-only' prevents client bundle inclusion
import 'server-only';
import { env } from '@/env';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(env.DATABASE_URL);
export const db = drizzle(client);
```

## Details

Next.js treats environment variables differently depending on when and where they are accessed:

**Build-time inlining:** `NEXT_PUBLIC_` variables are replaced with their literal values at build time (`process.env.NEXT_PUBLIC_API_URL` becomes `"https://api.example.com"` in the bundle). This means the value is fixed at build time and cannot change at runtime without rebuilding.

**Server-only variables:** Variables without `NEXT_PUBLIC_` are only available in Server Components, Route Handlers, and other server-side code. Accessing them in a Client Component returns `undefined` and does not leak the value — it simply does not work.

**`.env` file priority:** Next.js loads `.env`, `.env.local`, `.env.development`/`.env.production`, and `.env.development.local`/`.env.production.local`. More specific files override less specific ones. `.local` files take highest priority and should be in `.gitignore`.

**Runtime vs build-time:** Variables set in the Vercel dashboard are available at runtime in server-side code. However, `NEXT_PUBLIC_` variables must be set at build time in Vercel — setting them in the dashboard alone requires a rebuild.

**t3-env benefits:** Without validation, a missing `DATABASE_URL` crashes the app at the first database query — potentially after deployment. `t3-env` fails the build or server startup immediately with a clear error listing every missing or invalid variable.

**`server-only` package:** `import 'server-only'` causes a build error if the module is imported in a Client Component. Use it in any module that accesses secrets, database clients, or other server-only resources. Pair with `client-only` for the inverse — marking browser-only modules.

## Source

https://nextjs.org/docs/app/building-your-application/configuring/environment-variables

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
