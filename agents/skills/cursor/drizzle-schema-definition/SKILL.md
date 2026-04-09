# Drizzle Schema Definition

> Define Drizzle ORM schemas with pgTable/mysqlTable/sqliteTable, column types, indexes, and constraints

## When to Use

- Starting a new project with Drizzle ORM
- Defining database tables, columns, and constraints in TypeScript
- Adding indexes, unique constraints, or composite primary keys
- Choosing between PostgreSQL, MySQL, and SQLite column types

## Instructions

1. **Define a table** using the provider-specific function. Export it as a const:

```typescript
import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

2. **Choose the correct column types:**
   - Text: `text()`, `varchar('col', { length: 255 })`, `char()`
   - Numeric: `integer()`, `bigint()`, `real()`, `doublePrecision()`, `numeric('col', { precision: 10, scale: 2 })`
   - Boolean: `boolean()`
   - Dates: `timestamp()`, `date()`, `time()`
   - JSON: `json()`, `jsonb()` (PostgreSQL)
   - Binary: `bytea()` (PostgreSQL)
   - Enum: `pgEnum('status', ['active', 'inactive'])`

3. **Add constraints** with chained methods:

```typescript
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  viewCount: integer('view_count').notNull().default(0),
});
```

4. **Add indexes** as a third argument to the table function:

```typescript
export const posts = pgTable(
  'posts',
  {
    // ... columns
  },
  (table) => [
    index('posts_author_idx').on(table.authorId),
    uniqueIndex('posts_slug_idx').on(table.slug),
    index('posts_author_created_idx').on(table.authorId, table.createdAt),
  ]
);
```

5. **Define enums** (PostgreSQL only) separately and reference them:

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['user', 'admin', 'moderator']);

export const users = pgTable('users', {
  role: roleEnum('role').notNull().default('user'),
});
```

6. **Composite primary keys:**

```typescript
import { primaryKey } from 'drizzle-orm/pg-core';

export const postTags = pgTable(
  'post_tags',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })]
);
```

7. **Infer TypeScript types** from the schema:

```typescript
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
```

8. **Organize schemas** by exporting all tables from a central `db/schema.ts` file that the Drizzle config references.

## Details

Drizzle schemas are pure TypeScript — no code generation step, no DSL. The schema IS the TypeScript code, which means you get autocompletion, refactoring, and type inference for free.

**Provider differences:** `pgTable` (PostgreSQL), `mysqlTable` (MySQL), `sqliteTable` (SQLite) each support their native column types. You cannot mix providers in one schema. SQLite has the fewest column types; PostgreSQL has the most (arrays, jsonb, custom types).

**Column naming convention:** The first argument to each column function is the database column name. Use `snake_case` for database names while keeping TypeScript property names in `camelCase`:

```typescript
// TypeScript: user.createdAt → Database: created_at
createdAt: timestamp('created_at').notNull().defaultNow(),
```

**Default values:** `.default(value)` sets a JavaScript default. `.defaultNow()` and `.defaultRandom()` generate SQL defaults (`DEFAULT NOW()`, `DEFAULT gen_random_uuid()`). Use SQL defaults when records may be inserted outside Drizzle.

**References and foreign keys:** `.references(() => otherTable.column)` creates a foreign key constraint. The arrow function is required to handle circular references between tables. Add `{ onDelete: 'cascade' }` for cascade behavior.

**Trade-offs:**

- No separate schema file or code generation — but schema changes require manual migration creation
- Full TypeScript inference — but complex schemas can slow down IDE type-checking
- Direct SQL control — but you must know your database's column types rather than abstracting them

## Source

https://orm.drizzle.team/docs/column-types/pg

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
