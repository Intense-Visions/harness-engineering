# Drizzle Filtering Pattern

> Filter Drizzle queries with eq(), and(), or(), between(), sql template tag, and custom conditions

## When to Use

- Adding WHERE clauses to Drizzle queries
- Combining multiple filter conditions with boolean logic
- Building dynamic filters from user input
- Using database-specific operators (LIKE, ILIKE, IN, BETWEEN)

## Instructions

1. **Basic equality** with `eq()`:

```typescript
import { eq } from 'drizzle-orm';

const admins = await db.select().from(users).where(eq(users.role, 'admin'));
```

2. **Comparison operators** — `ne`, `gt`, `gte`, `lt`, `lte`:

```typescript
import { gt, lte } from 'drizzle-orm';

const recentPosts = await db
  .select()
  .from(posts)
  .where(gt(posts.createdAt, new Date('2024-01-01')));
```

3. **Combine conditions** with `and()` and `or()`:

```typescript
import { and, or, eq, like } from 'drizzle-orm';

const results = await db
  .select()
  .from(posts)
  .where(
    and(
      eq(posts.published, true),
      or(like(posts.title, `%${search}%`), like(posts.content, `%${search}%`))
    )
  );
```

4. **IN operator** with `inArray` and `notInArray`:

```typescript
import { inArray } from 'drizzle-orm';

const tagged = await db
  .select()
  .from(posts)
  .where(inArray(posts.status, ['published', 'featured']));
```

5. **BETWEEN:**

```typescript
import { between } from 'drizzle-orm';

const rangePosts = await db
  .select()
  .from(posts)
  .where(between(posts.viewCount, 100, 1000));
```

6. **NULL checks** with `isNull` and `isNotNull`:

```typescript
import { isNull, isNotNull } from 'drizzle-orm';

const drafts = await db.select().from(posts).where(isNull(posts.publishedAt));
```

7. **Pattern matching** with `like` and `ilike` (PostgreSQL):

```typescript
import { ilike } from 'drizzle-orm';

const matches = await db
  .select()
  .from(users)
  .where(ilike(users.name, `%${query}%`));
```

8. **Negation** with `not`:

```typescript
import { not, eq } from 'drizzle-orm';

const nonAdmins = await db
  .select()
  .from(users)
  .where(not(eq(users.role, 'admin')));
```

9. **Build dynamic filters** from user input:

```typescript
import { and, eq, ilike, SQL } from 'drizzle-orm';

function buildFilters(params: SearchParams): SQL | undefined {
  const conditions: SQL[] = [];

  if (params.search) {
    conditions.push(ilike(posts.title, `%${params.search}%`));
  }
  if (params.authorId) {
    conditions.push(eq(posts.authorId, params.authorId));
  }
  if (params.published !== undefined) {
    conditions.push(eq(posts.published, params.published));
  }

  return conditions.length ? and(...conditions) : undefined;
}

const results = await db.select().from(posts).where(buildFilters(params));
```

10. **Raw SQL conditions** with the `sql` template tag:

```typescript
import { sql } from 'drizzle-orm';

const results = await db
  .select()
  .from(posts)
  .where(sql`${posts.title} @@ plainto_tsquery('english', ${query})`);
```

## Details

Drizzle filter operators are imported from `drizzle-orm` and return `SQL` objects that compose into WHERE clauses. The design mirrors SQL syntax, making it easy to translate SQL knowledge to Drizzle code.

**Operator reference:**

- Equality: `eq`, `ne`
- Comparison: `gt`, `gte`, `lt`, `lte`
- Set: `inArray`, `notInArray`
- Range: `between`, `notBetween`
- Null: `isNull`, `isNotNull`
- Pattern: `like`, `ilike`, `notLike`, `notIlike`
- Logic: `and`, `or`, `not`
- Existence: `exists`, `notExists` (for subqueries)

**Relational query API filters:** The relational API uses a different syntax:

```typescript
const users = await db.query.users.findMany({
  where: (users, { eq, and }) => and(eq(users.role, 'admin'), eq(users.isActive, true)),
});
```

**Type safety:** Operators enforce column types at compile time. `eq(users.email, 42)` is a TypeScript error because `email` is a `text` column.

**Trade-offs:**

- `ilike` is PostgreSQL-specific — use `like` with manual lowercasing for MySQL compatibility
- `and()` and `or()` accept `undefined` values and filter them out, which makes dynamic filter building clean
- The `sql` template tag bypasses type checking — use it sparingly and validate inputs

## Source

https://orm.drizzle.team/docs/operators
