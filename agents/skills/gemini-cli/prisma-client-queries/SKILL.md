# Prisma Client Queries

> Query data with Prisma Client findUnique/findMany, create/update/delete, upsert, select, include

## When to Use

- Reading data from the database with type-safe queries
- Creating, updating, or deleting records
- Selecting specific fields or including related records
- Performing upserts (create-or-update) operations

## Instructions

1. **Instantiate the client once** and reuse it. Never create a new `PrismaClient` per request:

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

2. **Find a single record** — use `findUnique` for lookups by `@id` or `@unique` fields. Use `findFirst` when filtering by non-unique fields:

```typescript
const user = await prisma.user.findUnique({ where: { id: userId } });
const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
```

3. **Find multiple records** — `findMany` returns an array. Always paginate large result sets:

```typescript
const users = await prisma.user.findMany({
  where: { role: 'USER' },
  take: 20,
  skip: 0,
  orderBy: { createdAt: 'desc' },
});
```

4. **Select specific fields** to avoid over-fetching:

```typescript
const names = await prisma.user.findMany({
  select: { id: true, name: true, email: true },
});
// Type: { id: string; name: string | null; email: string }[]
```

5. **Include related records** with `include`:

```typescript
const userWithPosts = await prisma.user.findUnique({
  where: { id: userId },
  include: { posts: { where: { published: true }, take: 10 } },
});
```

6. **Create a record** — all required fields must be provided:

```typescript
const user = await prisma.user.create({
  data: { email: 'new@example.com', name: 'New User' },
});
```

7. **Update a record** — requires a unique `where` clause:

```typescript
const updated = await prisma.user.update({
  where: { id: userId },
  data: { name: 'Updated Name' },
});
```

8. **Upsert** — create if not found, update if found:

```typescript
const user = await prisma.user.upsert({
  where: { email: 'user@example.com' },
  create: { email: 'user@example.com', name: 'New' },
  update: { name: 'Existing' },
});
```

9. **Delete** — use `delete` for single records, `deleteMany` for bulk:

```typescript
await prisma.user.delete({ where: { id: userId } });
await prisma.post.deleteMany({ where: { authorId: userId } });
```

10. **Nested writes** — create or connect related records in one operation:

```typescript
const user = await prisma.user.create({
  data: {
    email: 'author@example.com',
    posts: { create: [{ title: 'First Post' }, { title: 'Second Post' }] },
  },
  include: { posts: true },
});
```

## Details

Prisma Client is auto-generated from the schema and provides full TypeScript types for every query. The generated types enforce that you only pass valid field names, filter operators, and relation includes.

**`select` vs `include`:** These are mutually exclusive at the same level. `select` returns only the specified fields (plus any nested `select`/`include`). `include` returns all scalar fields plus the specified relations.

**`findUnique` vs `findFirst`:** `findUnique` can only filter by `@id` or `@unique` fields and benefits from Prisma's internal query deduplication (DataLoader batching). `findFirst` can filter by any field but does not deduplicate.

**`findUniqueOrThrow` / `findFirstOrThrow`:** These variants throw a `PrismaClientKnownRequestError` with code `P2025` instead of returning `null`. Use them when absence is an error condition.

**Nested writes are atomic:** `create` with nested `create`/`connect`/`connectOrCreate` runs in a single implicit transaction. If any nested operation fails, the entire write is rolled back.

**Return types narrow automatically:** When you use `select`, the return type includes only the selected fields. This is enforced at the TypeScript level, so your code stays type-safe.

**Common mistakes:**

- Using `findFirst` where `findUnique` would work — loses batching optimization
- Deeply nesting `include` — each level adds a separate database query. Three levels deep on a list page causes N+1 problems
- Not handling `null` from `findUnique` — always check or use `findUniqueOrThrow`
- Forgetting that `updateMany`/`deleteMany` do not return the affected records — only a count

## Source

https://prisma.io/docs/orm/prisma-client/queries
