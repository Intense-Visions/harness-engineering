# Drizzle Relations Pattern

> Define Drizzle relations with relations(), one(), many(), references(), and inferred types

## When to Use

- Defining relationships between Drizzle tables for the relational query API
- Enabling `with` clauses to load related data
- Modeling one-to-one, one-to-many, and many-to-many associations
- Inferring TypeScript types for query results with nested relations

## Instructions

1. **Define relations separately** from the table. Relations are metadata for the relational query API — they do not create foreign keys:

```typescript
import { relations } from 'drizzle-orm';
import { users, posts } from './schema';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

2. **One-to-one** — use `one()` on both sides:

```typescript
export const usersRelations = relations(users, ({ one }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));
```

3. **One-to-many** — `many()` on the parent, `one()` with fields/references on the child:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

4. **Many-to-many** — use an explicit join table with relations on all three tables:

```typescript
export const postsRelations = relations(posts, ({ many }) => ({
  postTags: many(postTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  postTags: many(postTags),
}));

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, { fields: [postTags.postId], references: [posts.id] }),
  tag: one(tags, { fields: [postTags.tagId], references: [tags.id] }),
}));
```

5. **Query with relations** using the relational query API:

```typescript
const usersWithPosts = await db.query.users.findMany({
  with: {
    posts: {
      limit: 10,
      orderBy: (posts, { desc }) => [desc(posts.createdAt)],
      with: { tags: true },
    },
  },
});
```

6. **Self-relations** — name the relation to disambiguate:

```typescript
export const employeesRelations = relations(employees, ({ one, many }) => ({
  manager: one(employees, {
    fields: [employees.managerId],
    references: [employees.id],
    relationName: 'managerReports',
  }),
  reports: many(employees, { relationName: 'managerReports' }),
}));
```

7. **Pass all relations to drizzle()** when initializing the client:

```typescript
import * as schema from './schema';

const db = drizzle(pool, { schema });
// db.query.users.findMany({ with: { posts: true } }) now works
```

## Details

Drizzle has two query APIs: the **SQL-like query builder** (`db.select().from(users)`) and the **relational query API** (`db.query.users.findMany()`). Relations only affect the relational query API. The SQL-like builder uses explicit `join()` calls instead.

**Relations are not foreign keys.** Defining `relations()` does not create database constraints. Foreign keys are defined on the schema columns with `.references()`. Relations are a query-time concept for the ORM to know how to join tables.

**Type inference with relations:**

```typescript
type UserWithPosts = Awaited<
  ReturnType<
    typeof db.query.users.findFirst<{
      with: { posts: true };
    }>
  >
>;
```

Or extract with `InferSelectModel` and manually add the relation types.

**Multiple relations to the same table:** Use `relationName` to disambiguate:

```typescript
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
    relationName: 'postAuthor',
  }),
  editor: one(users, {
    fields: [posts.editorId],
    references: [users.id],
    relationName: 'postEditor',
  }),
}));
```

**Trade-offs:**

- Relations are defined separately from the table schema, which means two files to update when adding a relationship
- The relational query API generates subqueries rather than JOINs — for complex multi-table queries, use the SQL-like builder with explicit joins
- Drizzle does not have implicit many-to-many — you always need an explicit join table

## Source

https://orm.drizzle.team/docs/relations

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
