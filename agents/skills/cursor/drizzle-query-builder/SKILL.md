# Drizzle Query Builder

> Compose type-safe SQL with Drizzle's fluent query builder for select, insert, update, and delete

## When to Use

- Writing SQL-like queries with full type safety in TypeScript
- Performing joins, subqueries, and aggregations
- Building dynamic queries with conditional clauses
- When you need more control than the relational query API provides

## Instructions

1. **Select** — query rows with the SQL-like builder:

```typescript
import { eq, desc } from 'drizzle-orm';

const allUsers = await db.select().from(users);

const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.isActive, true))
  .orderBy(desc(users.createdAt))
  .limit(20);
```

2. **Select specific columns:**

```typescript
const names = await db
  .select({
    id: users.id,
    name: users.name,
  })
  .from(users);
// Type: { id: string; name: string | null }[]
```

3. **Joins** — inner, left, right, full:

```typescript
const result = await db
  .select({
    userName: users.name,
    postTitle: posts.title,
  })
  .from(users)
  .innerJoin(posts, eq(users.id, posts.authorId))
  .where(eq(posts.published, true));
```

4. **Left join** preserves all left rows (right columns may be null):

```typescript
const result = await db
  .select({
    user: users,
    latestPost: posts,
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));
// Type: { user: User; latestPost: Post | null }[]
```

5. **Insert** — single or multiple rows:

```typescript
await db.insert(users).values({
  email: 'alice@example.com',
  name: 'Alice',
});

// Bulk insert
await db.insert(users).values([
  { email: 'bob@example.com', name: 'Bob' },
  { email: 'carol@example.com', name: 'Carol' },
]);

// Insert with returning
const [newUser] = await db
  .insert(users)
  .values({ email: 'dave@example.com', name: 'Dave' })
  .returning();
```

6. **Upsert** with `onConflictDoUpdate`:

```typescript
await db
  .insert(users)
  .values({ email: 'alice@example.com', name: 'Alice Updated' })
  .onConflictDoUpdate({
    target: users.email,
    set: { name: 'Alice Updated' },
  });
```

7. **Update:**

```typescript
await db.update(users).set({ name: 'New Name', updatedAt: new Date() }).where(eq(users.id, userId));

// Update with returning
const [updated] = await db
  .update(users)
  .set({ isActive: false })
  .where(eq(users.id, userId))
  .returning();
```

8. **Delete:**

```typescript
await db.delete(posts).where(eq(posts.authorId, userId));

const [deleted] = await db.delete(users).where(eq(users.id, userId)).returning();
```

9. **Subqueries:**

```typescript
import { sql } from 'drizzle-orm';

const subquery = db
  .select({
    authorId: posts.authorId,
    postCount: sql<number>`count(*)`.as('post_count'),
  })
  .from(posts)
  .groupBy(posts.authorId)
  .as('post_counts');

const result = await db
  .select({
    name: users.name,
    postCount: subquery.postCount,
  })
  .from(users)
  .leftJoin(subquery, eq(users.id, subquery.authorId));
```

10. **Aggregations:**

```typescript
import { count, avg, sum, max, min } from 'drizzle-orm';

const stats = await db
  .select({
    totalPosts: count(),
    avgViews: avg(posts.viewCount),
  })
  .from(posts)
  .where(eq(posts.published, true));
```

## Details

The Drizzle query builder mirrors SQL syntax closely. Every method returns a new query object (immutable), and the final result is obtained by awaiting the query.

**Two query APIs:** Drizzle offers the SQL-like builder (`db.select().from()`) and the relational query API (`db.query.table.findMany()`). Use the SQL-like builder for joins, aggregations, and complex queries. Use the relational API for simple CRUD with nested includes.

**Type inference:** The query builder infers result types from the selected columns. Selecting `{ name: users.name }` returns `{ name: string | null }[]`. Left joins correctly type nullable columns.

**`.returning()` support:** Available on PostgreSQL and SQLite. MySQL does not support RETURNING — use `insertId` from the result instead.

**Prepared statements:**

```typescript
const prepared = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare();

const user = await prepared.execute({ id: userId });
```

Prepared statements are compiled once and reused, reducing parsing overhead for repeated queries.

**Trade-offs:**

- SQL-like syntax is explicit but more verbose than the relational API for simple includes
- Joins require manual column selection — no automatic "include everything" like the relational API
- Subqueries must be aliased with `.as()` — forgetting this causes TypeScript errors

## Source

https://orm.drizzle.team/docs/select

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
