# Prisma Soft Delete

> Implement soft deletes in Prisma with middleware or $extends query extensions and deletedAt pattern

## When to Use

- Retaining records for audit trails instead of permanently deleting them
- Implementing "trash" or "archive" features with restore capability
- Meeting regulatory requirements that mandate data retention
- Protecting against accidental deletion in production systems

## Instructions

1. **Add a `deletedAt` field** to models that need soft delete:

```prisma
model Post {
  id        String    @id @default(cuid())
  title     String
  content   String
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

2. **Use `$extends` (recommended)** to intercept delete operations and convert them to updates:

```typescript
const prisma = new PrismaClient().$extends({
  query: {
    post: {
      async delete({ args, query }) {
        return prisma.post.update({
          ...args,
          data: { deletedAt: new Date() },
        });
      },
      async deleteMany({ args, query }) {
        return prisma.post.updateMany({
          ...args,
          data: { deletedAt: new Date() },
        });
      },
    },
  },
});
```

3. **Auto-filter deleted records** by extending `findMany`, `findFirst`, and `findUnique`:

```typescript
const prisma = new PrismaClient().$extends({
  query: {
    post: {
      async findMany({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findFirst({ args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async findUnique({ args, query }) {
        // findUnique cannot filter on non-unique fields;
        // fall back to findFirst
        return prisma.post.findFirst({
          where: { ...args.where, deletedAt: null },
        });
      },
    },
  },
});
```

4. **Create a reusable extension** for multiple models:

```typescript
function softDeleteExtension<T extends string>(modelName: T) {
  return {
    query: {
      [modelName]: {
        async delete({ args, query }: any) {
          return (prisma as any)[modelName].update({
            ...args,
            data: { deletedAt: new Date() },
          });
        },
        async findMany({ args, query }: any) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
      },
    },
  };
}
```

5. **Add a restore function** — either as a regular update or a model extension:

```typescript
// Restore a soft-deleted record
await prisma.post.update({
  where: { id: postId },
  data: { deletedAt: null },
});
```

6. **Hard delete when needed** — bypass the extension with `$executeRaw`:

```typescript
await prisma.$executeRaw`DELETE FROM "Post" WHERE id = ${postId}`;
```

7. **Filter relations** — ensure soft-deleted records are excluded from relation queries:

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { posts: { where: { deletedAt: null } } },
});
```

## Details

Soft delete replaces physical row deletion with a timestamp marker. The record remains in the database but is excluded from normal queries. This pattern is widely used for audit compliance, undo functionality, and data recovery.

**`$extends` vs middleware:** Prisma deprecated middleware in favor of `$extends` (client extensions). Extensions are type-safe, composable, and scoped to specific models. Middleware applied globally and was hard to type correctly.

**Index strategy:** Always add an index on `deletedAt`. Most queries filter on `WHERE "deletedAt" IS NULL`, so a partial index is ideal:

```sql
CREATE INDEX idx_post_active ON "Post" (id) WHERE "deletedAt" IS NULL;
```

Add this as a custom migration after Prisma generates the base migration.

**Unique constraints with soft delete:** A unique constraint on `email` breaks if you soft-delete a user and create a new one with the same email. Solutions:

- Use a partial unique index: `CREATE UNIQUE INDEX ON "User" (email) WHERE "deletedAt" IS NULL`
- Append a suffix to soft-deleted records: `email_deleted_<timestamp>`
- Use a composite unique: `@@unique([email, deletedAt])` (but `null` handling varies by database)

**Cascading soft deletes:** Unlike `onDelete: Cascade`, soft deletes do not automatically cascade to related records. Implement cascading manually in the `$extends` delete handler or use database triggers.

**Trade-offs:**

- Soft delete increases table size over time — implement a purge job for records past the retention period
- Every query must remember to filter `deletedAt` — the extension approach prevents this but adds overhead
- Reporting queries that need deleted records must explicitly include them, which the auto-filter makes harder

## Source

https://prisma.io/docs/orm/prisma-client/queries/middleware/soft-delete-middleware
