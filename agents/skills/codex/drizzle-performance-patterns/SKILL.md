# Drizzle Performance Patterns

> Optimize Drizzle queries with prepared statements, db.batch(), explain analysis, and join-based N+1 avoidance

## When to Use

- Improving query performance in a Drizzle application
- Reducing round-trips with batching and prepared statements
- Diagnosing slow queries with EXPLAIN analysis
- Eliminating N+1 patterns in list queries

## Instructions

1. **Use prepared statements** for frequently executed queries:

```typescript
const getUserById = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder('id')))
  .prepare('get_user_by_id');

// Reuse — skips query parsing on subsequent calls
const user = await getUserById.execute({ id: userId });
```

2. **Select only needed columns** to reduce data transfer:

```typescript
// Bad: fetches all columns
const all = await db.select().from(users);

// Good: fetches only what the UI needs
const summary = await db
  .select({
    id: users.id,
    name: users.name,
  })
  .from(users);
```

3. **Prevent N+1 with joins** instead of sequential queries:

```typescript
// N+1 anti-pattern
const allUsers = await db.select().from(users);
for (const user of allUsers) {
  const userPosts = await db.select().from(posts).where(eq(posts.authorId, user.id));
}

// Fixed: single query with join
const usersWithPosts = await db
  .select({
    user: users,
    post: posts,
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));
```

4. **Or use the relational API** for N+1 avoidance:

```typescript
const usersWithPosts = await db.query.users.findMany({
  with: { posts: { limit: 10 } },
});
```

5. **Batch multiple queries** with `db.batch()` (supported by Neon, LibSQL):

```typescript
const [users, posts, stats] = await db.batch([
  db.select().from(users).limit(10),
  db.select().from(posts).where(eq(posts.published, true)).limit(10),
  db.select({ count: sql<number>`count(*)` }).from(users),
]);
```

6. **Add database indexes** matching your query patterns:

```typescript
export const posts = pgTable(
  'posts',
  {
    authorId: uuid('author_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    status: text('status').notNull(),
  },
  (table) => [
    index('posts_author_idx').on(table.authorId),
    index('posts_status_created_idx').on(table.status, table.createdAt),
  ]
);
```

7. **Cursor pagination** for large datasets:

```typescript
const page = await db
  .select()
  .from(posts)
  .where(gt(posts.id, lastSeenId))
  .orderBy(asc(posts.id))
  .limit(20);
```

8. **Use EXPLAIN** to analyze query plans:

```typescript
const plan = await db.execute(
  sql`EXPLAIN ANALYZE SELECT * FROM posts WHERE author_id = ${authorId}`
);
console.log(plan.rows);
```

Look for sequential scans on large tables — add indexes for filtered columns.

9. **Bulk inserts** with single INSERT statements:

```typescript
await db.insert(events).values(items.map((item) => ({ type: item.type, payload: item.data })));
```

10. **Connection pooling** for serverless environments:

```typescript
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
```

## Details

Drizzle generates SQL that closely mirrors what you write. Unlike heavier ORMs, there is minimal abstraction overhead — the generated SQL is predictable and easy to optimize.

**Prepared statements:** The first execution compiles and caches the query plan. Subsequent executions reuse it. This reduces parsing overhead by 10-30% for complex queries. Name prepared statements uniquely — duplicate names cause errors.

**`db.batch()` support:** Currently available for Neon HTTP, LibSQL/Turso, and D1. It sends multiple queries in a single HTTP request, reducing round-trip latency. Not available for standard PostgreSQL drivers (use transactions instead for batching).

**Relational API query generation:** The `with` clause generates subqueries, not JOINs. For `findMany({ with: { posts: true } })`, Drizzle executes two queries: one for users and one for posts with `WHERE author_id IN (...)`. This avoids row multiplication from JOINs on one-to-many relations.

**Query complexity vs performance:**

- Simple selects with indexes: <1ms
- Joins on indexed foreign keys: 1-5ms
- Subqueries with aggregation: 5-50ms
- Full table scans on unindexed columns: 100ms+ (add indexes)

**Trade-offs:**

- Prepared statements hold server-side state — too many prepared statements can exhaust PostgreSQL's memory. Use for hot-path queries only
- `db.batch()` is driver-specific — code that uses it is not portable across drivers
- Cursor pagination requires a stable, indexed sort column — use primary key or a unique timestamp
- The relational API uses subqueries which can be slower than explicit JOINs for large datasets with selective filters

## Source

https://orm.drizzle.team/docs/performance

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
