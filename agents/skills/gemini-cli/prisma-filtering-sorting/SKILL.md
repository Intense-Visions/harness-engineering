# Prisma Filtering and Sorting

> Filter and sort Prisma queries with where, AND/OR/NOT, orderBy, and cursor/offset pagination

## When to Use

- Building dynamic search or filter queries against Prisma models
- Combining multiple filter conditions with boolean logic
- Sorting results by one or more fields
- Implementing pagination with cursor-based or offset strategies

## Instructions

1. **Basic equality filter** — pass field values directly in `where`:

```typescript
const users = await prisma.user.findMany({
  where: { role: 'ADMIN', isActive: true },
});
```

Multiple top-level fields are implicitly AND-ed.

2. **Comparison operators** — use `equals`, `not`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`:

```typescript
const recentPosts = await prisma.post.findMany({
  where: {
    createdAt: { gte: new Date('2024-01-01') },
    viewCount: { gt: 100 },
  },
});
```

3. **String filters** — use `contains`, `startsWith`, `endsWith`. Add `mode: 'insensitive'` for case-insensitive matching (PostgreSQL only):

```typescript
const results = await prisma.user.findMany({
  where: { name: { contains: 'john', mode: 'insensitive' } },
});
```

4. **Boolean combinators** — use `AND`, `OR`, `NOT` for complex logic:

```typescript
const filtered = await prisma.post.findMany({
  where: {
    OR: [{ title: { contains: search } }, { content: { contains: search } }],
    AND: { published: true },
    NOT: { authorId: blockedUserId },
  },
});
```

5. **Filter on relations** — use `some`, `every`, `none` for to-many relations and `is`, `isNot` for to-one:

```typescript
const usersWithPublishedPosts = await prisma.user.findMany({
  where: { posts: { some: { published: true } } },
});
```

6. **Sort with `orderBy`** — pass one or multiple sort fields:

```typescript
const sorted = await prisma.post.findMany({
  orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
});
```

7. **Sort on relations** — order by a related field count or value:

```typescript
const byPostCount = await prisma.user.findMany({
  orderBy: { posts: { _count: 'desc' } },
});
```

8. **Offset pagination** — use `skip` and `take`:

```typescript
const page = await prisma.post.findMany({
  skip: (pageNumber - 1) * pageSize,
  take: pageSize,
  orderBy: { createdAt: 'desc' },
});
```

9. **Cursor pagination** — use `cursor` with `skip: 1` to exclude the cursor record:

```typescript
const nextPage = await prisma.post.findMany({
  cursor: { id: lastPostId },
  skip: 1,
  take: 20,
  orderBy: { createdAt: 'desc' },
});
```

10. **Aggregations** — use `aggregate`, `groupBy`, and `count`:

```typescript
const stats = await prisma.post.aggregate({
  _avg: { viewCount: true },
  _max: { viewCount: true },
  where: { published: true },
});
```

## Details

Prisma's filtering and sorting are fully type-safe. The available filter operators depend on the field type — `contains` only appears on `String` fields, `gt`/`lt` only on numeric and `DateTime` fields.

**Offset vs cursor pagination:** Offset (`skip`/`take`) is simpler to implement but degrades at high offsets because the database still scans skipped rows. Cursor pagination (`cursor`/`take`) uses an indexed value (usually `id` or `createdAt`) and performs consistently regardless of position. Use cursor pagination for infinite scroll or large datasets.

**Dynamic filters:** Build `where` objects conditionally to avoid unnecessary filters:

```typescript
const where: Prisma.PostWhereInput = { published: true };
if (search) where.title = { contains: search, mode: 'insensitive' };
if (authorId) where.authorId = authorId;

const posts = await prisma.post.findMany({ where });
```

**`null` filtering:** Use `equals: null` to find null values and `not: null` to exclude them. With `strictNullChecks`, Prisma distinguishes between "field is null" and "field is not provided in the filter."

**Aggregation limitations:**

- `groupBy` requires all non-aggregated fields in the `by` array
- You cannot aggregate on relations — use raw queries for complex aggregations like joining and grouping across tables
- `count` returns `number`, not `BigInt`, even on tables with `BigInt` IDs

**Performance notes:**

- Filtering on non-indexed fields triggers full table scans. Always check that filtered fields have database indexes
- `mode: 'insensitive'` on PostgreSQL uses `ILIKE` which cannot use standard B-tree indexes — create a GIN/GiST trigram index or a functional index with `lower()` for production workloads

## Source

https://prisma.io/docs/orm/prisma-client/queries/filtering-and-sorting

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
