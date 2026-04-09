# Drizzle with Next.js

> Integrate Drizzle with Next.js using Neon/Vercel Postgres, edge runtime, and connection pooling

## When to Use

- Setting up Drizzle ORM in a Next.js application
- Connecting to PostgreSQL from serverless/edge environments
- Configuring connection pooling for Vercel deployments
- Using Drizzle in Server Components, Server Actions, and Route Handlers

## Instructions

1. **Install dependencies** for your database provider:

```bash
# Neon (serverless PostgreSQL)
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Vercel Postgres
npm install drizzle-orm @vercel/postgres
npm install -D drizzle-kit

# node-postgres (standard)
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

2. **Create the database client** with singleton pattern for Next.js hot reload:

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

For development with hot module reload, use a global singleton:

```typescript
// src/db/index.ts
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  db: NeonHttpDatabase<typeof schema>;
};

if (!globalForDb.db) {
  const sql = neon(process.env.DATABASE_URL!);
  globalForDb.db = drizzle(sql, { schema });
}

export const db = globalForDb.db;
```

3. **Use in Server Components** — query directly:

```typescript
// app/users/page.tsx
import { db } from '@/db';
import { users } from '@/db/schema';

export default async function UsersPage() {
  const allUsers = await db.query.users.findMany({
    orderBy: (users, { desc }) => [desc(users.createdAt)],
  });

  return <UserList users={allUsers} />;
}
```

4. **Use in Server Actions:**

```typescript
// app/users/actions.ts
'use server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function updateUserName(userId: string, name: string) {
  await db.update(users).set({ name }).where(eq(users.id, userId));
  revalidatePath('/users');
}
```

5. **Use in Route Handlers:**

```typescript
// app/api/users/route.ts
import { db } from '@/db';
import { users } from '@/db/schema';
import { NextResponse } from 'next/server';

export async function GET() {
  const allUsers = await db.query.users.findMany();
  return NextResponse.json(allUsers);
}
```

6. **Configure drizzle-kit** for migrations:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

7. **Run migrations** at build time or application start:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

8. **Edge runtime compatibility** — use the HTTP-based Neon driver for edge:

```typescript
// For edge runtime (middleware, edge API routes)
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

// For Node.js runtime (standard API routes, Server Components)
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
```

## Details

Next.js serverless functions create a new runtime per invocation. Without connection pooling, each invocation opens (and may not close) a database connection, exhausting the connection limit.

**Driver selection:**

- `neon-http` — uses HTTP protocol, works in Edge Runtime, one query per request (no transactions), lowest latency for single queries
- `neon-serverless` — uses WebSocket protocol, supports transactions, works in both Edge and Node.js runtimes
- `node-postgres` — standard PostgreSQL driver, Node.js only, supports everything, requires connection pooling for serverless

**Connection pooling strategies:**

- **Neon built-in pooler** — append `?pooling=true` to the connection string. Uses PgBouncer on Neon's infrastructure
- **Vercel Postgres** — built-in pooling via `@vercel/postgres`
- **External PgBouncer** — use a `DIRECT_URL` for migrations and a pooled `DATABASE_URL` for runtime queries

**Environment variables pattern:**

```env
# Pooled connection for runtime queries
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
# Direct connection for migrations (bypasses pooler)
DIRECT_URL="postgresql://user:pass@direct-host/db?sslmode=require"
```

**Trade-offs:**

- `neon-http` is the fastest single-query driver but cannot run transactions — use `neon-serverless` if you need multi-statement transactions
- The global singleton pattern prevents connection exhaustion during development hot reload but is not needed in production
- Edge Runtime has no `fs` access — run migrations via CLI or in a Node.js environment, not at edge request time

## Source

https://orm.drizzle.team/docs/get-started-postgresql

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
