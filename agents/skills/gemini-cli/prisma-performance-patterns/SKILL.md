# Prisma Performance Patterns

> Optimize Prisma queries with select, findUnique index hits, batching, and avoiding N+1

## When to Use

- Diagnosing slow queries or high database load in a Prisma application
- Reducing data transfer by selecting only needed fields
- Eliminating N+1 query patterns in list endpoints
- Optimizing bulk read and write operations

## Instructions

1. **Select only needed fields** — `select` reduces data transfer and avoids loading large text/JSON columns:

```typescript
const users = await prisma.user.findMany({
  select: { id: true, name: true, email: true },
  // NOT: include the entire User with all 20 fields
});
```

2. **Use `findUnique` over `findFirst`** when querying by `@id` or `@unique` fields. Prisma batches `findUnique` calls automatically via internal DataLoader:

```typescript
// These two calls in the same tick are batched into one SQL query
const [user1, user2] = await Promise.all([
  prisma.user.findUnique({ where: { id: id1 } }),
  prisma.user.findUnique({ where: { id: id2 } }),
]);
```

3. **Avoid N+1 with `include`** — instead of querying related records in a loop:

```typescript
// BAD: N+1 — one query per user
const users = await prisma.user.findMany();
for (const user of users) {
  user.posts = await prisma.post.findMany({ where: { authorId: user.id } });
}

// GOOD: single include
const users = await prisma.user.findMany({
  include: { posts: true },
});
```

4. **Limit nested includes** — each `include` level adds a database query. For deep nesting, use raw SQL with JOINs instead:

```typescript
// Avoid: 4 levels of include = 4 queries
const data = await prisma.user.findMany({
  include: { posts: { include: { comments: { include: { author: true } } } } },
});

// Better: raw query with JOINs for the specific data shape you need
```

5. **Use `createMany` for bulk inserts** — one `INSERT` instead of N:

```typescript
await prisma.post.createMany({
  data: posts,
  skipDuplicates: true,
});
```

6. **Batch writes in transactions** — reduces round-trips:

```typescript
await prisma.$transaction(
  items.map((item) =>
    prisma.inventory.update({
      where: { sku: item.sku },
      data: { quantity: { decrement: item.qty } },
    })
  )
);
```

7. **Add database indexes** for filtered and sorted fields:

```prisma
model Post {
  authorId  String
  createdAt DateTime @default(now())
  published Boolean

  @@index([authorId, createdAt])
  @@index([published, createdAt])
}
```

8. **Enable query logging** to find slow queries:

```typescript
const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) console.warn(`Slow query (${e.duration}ms):`, e.query);
});
```

9. **Use connection pooling** — configure pool size based on your serverless or server environment:

```
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=30"
```

10. **Paginate with cursors** for large datasets — offset pagination degrades with large `skip` values:

```typescript
const page = await prisma.post.findMany({
  cursor: { id: lastId },
  skip: 1,
  take: 20,
  orderBy: { id: 'asc' },
});
```

## Details

Prisma generates SQL queries for every Client operation. Understanding the generated SQL helps diagnose performance issues.

**DataLoader batching:** Prisma's internal DataLoader batches `findUnique` calls that occur in the same event loop tick into a single `WHERE id IN (...)` query. This only works with `findUnique` — `findFirst` and `findMany` are never batched.

**`include` query mechanics:** Each `include` generates a separate `SELECT` with a `WHERE foreign_key IN (...)` clause using the parent IDs. This is more efficient than N+1 but still adds one query per include level. For read-heavy endpoints with complex data shapes, consider denormalizing or using raw SQL views.

**Connection pool sizing:** The default pool size is `num_physical_cpus * 2 + 1`. For serverless environments (Vercel, AWS Lambda), set `connection_limit=1` and use an external pooler (PgBouncer, Prisma Data Proxy) to avoid exhausting database connections.

**Prisma Accelerate / Data Proxy:** For edge deployments and serverless, Prisma Accelerate provides connection pooling and global caching. It adds latency per query but solves the connection exhaustion problem.

**Common performance antipatterns:**

- Fetching entire tables without pagination — always use `take` or `cursor`
- Using `include` with `findMany` on large collections — fetches all related records for all results
- Not indexing foreign key columns — Prisma does not create indexes for relation fields automatically
- Running `count` alongside `findMany` — two separate queries. Use a raw query with `COUNT(*) OVER()` for total count in one pass

## Source

https://prisma.io/docs/orm/prisma-client/queries/query-optimization-performance
