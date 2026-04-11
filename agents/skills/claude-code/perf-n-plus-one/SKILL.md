# N+1 Query Detection and Resolution

> Master N+1 query elimination — detecting N+1 patterns in ORMs and GraphQL resolvers, eager loading strategies, DataLoader batching, query count monitoring, and ORM-specific solutions for Prisma, Drizzle, Sequelize, and TypeORM.

## When to Use

- An API endpoint issues dozens or hundreds of queries for a single request
- Database query logs show repeated identical queries with different parameter values
- Response time scales linearly with the number of items in a list
- A list page is slow despite each individual item query being fast
- GraphQL resolvers trigger separate queries for each item's relations
- Database connection pool is frequently exhausted under moderate load
- ORM query logging reveals repetitive patterns like "SELECT FROM users WHERE id = ?"
- Moving from 10 test items to 1000 production items causes dramatic slowdown
- pg_stat_statements shows a query called thousands of times per minute with low individual cost
- Database CPU is high but no single query is slow

## Instructions

1. **Identify the N+1 pattern.** An N+1 occurs when code fetches a list (1 query) then fetches related data for each item individually (N queries):

   ```typescript
   // N+1 PROBLEM: 1 query for posts + N queries for authors
   const posts = await db.query('SELECT * FROM posts LIMIT 50'); // 1 query

   for (const post of posts) {
     post.author = await db.query(
       // 50 queries!
       'SELECT * FROM users WHERE id = $1',
       [post.author_id]
     );
   }
   // Total: 51 queries for 50 posts
   ```

2. **Fix with JOIN (single query).** The most performant solution collapses N+1 into a single query:

   ```sql
   -- SOLUTION 1: JOIN — single query, all data
   SELECT p.*, u.name AS author_name, u.avatar AS author_avatar
   FROM posts p
   JOIN users u ON u.id = p.author_id
   ORDER BY p.created_at DESC
   LIMIT 50;
   -- Total: 1 query
   ```

3. **Fix with eager loading in ORMs.** Each ORM has its own syntax for including relations:

   ```typescript
   // Prisma: include related data
   const posts = await prisma.post.findMany({
     take: 50,
     orderBy: { createdAt: 'desc' },
     include: {
       author: { select: { name: true, avatar: true } },
       tags: true,
       _count: { select: { comments: true } },
     },
   });
   // Prisma generates: 1 query for posts + 1 query for authors + 1 query for tags
   // Total: 3 queries (not 51+)

   // Drizzle: relational query
   const posts = await db.query.posts.findMany({
     limit: 50,
     orderBy: [desc(posts.createdAt)],
     with: {
       author: { columns: { name: true, avatar: true } },
       tags: true,
     },
   });

   // TypeORM: eager relations or query builder
   const posts = await postRepo.find({
     take: 50,
     order: { createdAt: 'DESC' },
     relations: ['author', 'tags'],
   });
   ```

4. **Fix with batch loading using IN clause.** When a JOIN is impractical, batch the N queries into one:

   ```typescript
   // SOLUTION 2: Batch with IN clause — 2 queries instead of N+1
   const posts = await db.query('SELECT * FROM posts LIMIT 50');

   const authorIds = [...new Set(posts.map((p) => p.author_id))];
   const authors = await db.query('SELECT * FROM users WHERE id = ANY($1)', [authorIds]);

   const authorMap = new Map(authors.map((a) => [a.id, a]));
   for (const post of posts) {
     post.author = authorMap.get(post.author_id);
   }
   // Total: 2 queries regardless of N
   ```

5. **Implement DataLoader for GraphQL resolvers.** DataLoader automatically batches individual loads within a single tick:

   ```typescript
   import DataLoader from 'dataloader';

   // Create a DataLoader that batches user lookups
   const userLoader = new DataLoader<string, User>(async (userIds) => {
     const users = await db.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
     const userMap = new Map(users.map((u) => [u.id, u]));
     return userIds.map((id) => userMap.get(id) || null);
   });

   // GraphQL resolver — each call is batched automatically
   const resolvers = {
     Post: {
       author: (post) => userLoader.load(post.authorId),
       // 50 posts → 50 calls to userLoader.load()
       // DataLoader batches into 1 query: WHERE id = ANY([...50 ids])
     },
   };

   // IMPORTANT: create a new DataLoader per request to prevent cache leaks
   function createLoaders() {
     return {
       userLoader: new DataLoader(batchUsers),
       postLoader: new DataLoader(batchPosts),
     };
   }
   ```

6. **Detect N+1 queries in development.** Add query counting to catch N+1 patterns before production:

   ```typescript
   // Prisma: enable query logging
   const prisma = new PrismaClient({
     log: [{ emit: 'event', level: 'query' }],
   });

   let queryCount = 0;
   prisma.$on('query', () => {
     queryCount++;
   });

   // After handling a request:
   if (queryCount > 10) {
     console.warn(`N+1 alert: ${queryCount} queries in single request`);
   }

   // Express middleware for query counting
   function queryCounter(req, res, next) {
     req.queryCount = 0;
     const origQuery = db.query.bind(db);
     db.query = (...args) => {
       req.queryCount++;
       return origQuery(...args);
     };
     res.on('finish', () => {
       if (req.queryCount > 10) {
         console.warn(`${req.method} ${req.path}: ${req.queryCount} queries`);
       }
     });
     next();
   }
   ```

7. **Handle nested N+1 (N+1+1).** N+1 can cascade across multiple relation levels:

   ```typescript
   // N+1+1: posts → authors → departments
   // Bad: 1 + 50 + 50 = 101 queries
   const posts = await getPosts();
   for (const post of posts) {
     post.author = await getUser(post.authorId); // N queries
     post.author.dept = await getDept(post.author.deptId); // N more queries
   }

   // Good: eager load all levels at once
   const posts = await prisma.post.findMany({
     include: {
       author: {
         include: { department: true }, // nested eager load
       },
     },
   });
   // Total: 3 queries (posts, authors, departments)
   ```

## Details

### Why N+1 Is Expensive

Each database query incurs fixed overhead: network round-trip (~0.5-2ms on localhost, 5-50ms cross-region), query parsing, plan generation, and connection acquisition from the pool. For 50 items, an N+1 pattern adds 25-100ms on localhost or 250-2500ms cross-region in pure overhead, before any actual data work. The queries are individually fast (each returns 1 row), which is why they do not appear in slow query logs. The problem is cumulative overhead.

### DataLoader Batch Window

DataLoader collects all `.load()` calls made during a single tick of the event loop (using `process.nextTick`). At the end of the tick, it calls the batch function with all collected keys. This means DataLoader only works when all loads are initiated synchronously or within the same microtask. If loads are spread across multiple awaits, they may not batch together. For GraphQL resolvers, this works naturally because all field resolvers for a single type run in the same tick.

### Worked Example: Shopify Admin API

Shopify's GraphQL Admin API uses DataLoader extensively to batch relationship resolution. A query fetching 50 orders with their line items, customers, and shipping addresses resolves in 4 database queries (one per entity type) instead of 201 (1 + 50 + 50 + 50 + 50). Each DataLoader is created per-request and destroyed afterward to prevent cross-request cache pollution. They instrument DataLoader batch sizes to alert when a batch exceeds 1000 IDs, indicating a query pattern that might benefit from a JOIN instead.

### Worked Example: GitHub Issue Tracker

GitHub's issue list API loads issues with their labels, assignees, and milestone. Early versions exhibited N+1 when loading labels (each issue triggered a separate labels query). They resolved it with a batch loader that collects all issue IDs and executes a single `SELECT * FROM issue_labels WHERE issue_id = ANY($1)` query. The result is mapped back to each issue using an in-memory index. Total queries for a 30-issue page: 4 (issues, labels, assignees, milestones) regardless of how many items have labels.

### Anti-Patterns

**Over-eager loading.** Including every relation "just in case" causes JOINs across many tables, producing cartesian products with massive result sets. Only include relations you actually need for the current view.

**Caching individual DataLoader results across requests.** DataLoader's built-in cache is per-request by design. Sharing a DataLoader across requests serves stale data and leaks memory. Always create new DataLoader instances per request.

**Assuming ORMs prevent N+1.** ORMs make N+1 easy to create by default (lazy loading). Accessing a relation property in a loop triggers individual queries. Always use explicit eager loading (include, with, relations) for list endpoints.

**Batch size without limits.** A DataLoader batch of 10,000 IDs generates a massive IN clause that the database must parse and plan. Set `maxBatchSize` on DataLoader (e.g., 100-500) and implement chunked batching for larger sets.

## Source

- DataLoader — https://github.com/graphql/dataloader
- Prisma: Relation queries — https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries
- Use The Index, Luke: N+1 — https://use-the-index-luke.com/sql/join
- PostgreSQL: EXPLAIN — https://www.postgresql.org/docs/current/using-explain.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- No list endpoint issues more than 5 database queries regardless of result count.
- GraphQL resolvers use DataLoader for all relationship loading.
- ORM queries use explicit eager loading (include/with/relations) for list views.
- Development environment logs a warning when query count exceeds a threshold per request.
- Nested relations are eager-loaded at all required levels.
