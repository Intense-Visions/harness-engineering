# Drizzle Raw SQL

> Execute raw SQL safely in Drizzle with the sql template tag, db.execute(), and placeholder()

## When to Use

- Running SQL that Drizzle's query builder cannot express (CTEs, window functions, recursive queries)
- Calling database-specific functions or operators
- Embedding raw SQL fragments within Drizzle queries
- Performing bulk operations with custom SQL

## Instructions

1. **Use the `sql` template tag** for type-safe, parameterized SQL:

```typescript
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`SELECT * FROM users WHERE email = ${email}`);
```

The `${email}` is automatically parameterized — never string-interpolated.

2. **Type the result** with a generic parameter:

```typescript
const result = await db.execute<{ id: string; email: string }>(
  sql`SELECT id, email FROM users WHERE role = ${role}`
);
// result.rows is typed as { id: string; email: string }[]
```

3. **Use `sql` fragments within queries:**

```typescript
const users = await db
  .select({
    id: users.id,
    fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
    postCount: sql<number>`(SELECT count(*) FROM posts WHERE posts.author_id = ${users.id})`,
  })
  .from(users);
```

4. **Dynamic identifiers** — use `sql.raw()` for trusted table or column names:

```typescript
const column = validColumns.includes(sortBy) ? sortBy : 'created_at';
const direction = order === 'desc' ? sql.raw('DESC') : sql.raw('ASC');

const result = await db
  .select()
  .from(users)
  .orderBy(sql`${sql.raw(column)} ${direction}`);
```

Always validate dynamic identifiers against an allowlist.

5. **Use `sql.placeholder()`** for prepared statements:

```typescript
const prepared = db
  .select()
  .from(users)
  .where(eq(users.role, sql.placeholder('role')))
  .prepare('users_by_role');

const admins = await prepared.execute({ role: 'admin' });
const mods = await prepared.execute({ role: 'moderator' });
```

6. **Common Table Expressions (CTEs):**

```typescript
const result = await db.execute(sql`
  WITH active_users AS (
    SELECT id, name FROM users WHERE is_active = true
  )
  SELECT au.name, count(p.id) as post_count
  FROM active_users au
  LEFT JOIN posts p ON p.author_id = au.id
  GROUP BY au.name
  ORDER BY post_count DESC
`);
```

7. **Aggregate functions in select:**

```typescript
import { sql } from 'drizzle-orm';

const stats = await db
  .select({
    totalViews: sql<number>`sum(${posts.viewCount})`,
    avgViews: sql<number>`avg(${posts.viewCount})::int`,
    maxViews: sql<number>`max(${posts.viewCount})`,
  })
  .from(posts)
  .where(eq(posts.published, true));
```

8. **Conditional SQL:**

```typescript
const results = await db
  .select({
    id: users.id,
    tier: sql<string>`CASE
    WHEN ${users.points} > 1000 THEN 'gold'
    WHEN ${users.points} > 500 THEN 'silver'
    ELSE 'bronze'
  END`,
  })
  .from(users);
```

## Details

The `sql` template tag is Drizzle's escape hatch for expressing SQL that the query builder cannot handle. It integrates seamlessly with Drizzle's type system and parameterization.

**How parameterization works:** When you write `sql\`WHERE email = ${email}\``, Drizzle generates `WHERE email = $1`(PostgreSQL) or`WHERE email = ?` (MySQL/SQLite) and passes the value as a parameter. This prevents SQL injection for all interpolated values.

**`sql.raw()` bypasses parameterization.** It inserts the string directly into the SQL. Use only for trusted, validated identifiers (table names, column names, SQL keywords). Never use it for user input.

**Type assertions:** `sql<number>\`count(\*)\``asserts the result type. Drizzle does not verify this at runtime — if the SQL returns a string but you assert`number`, you get a runtime error. Validate with Zod for critical paths.

**`sql.empty`:** An empty SQL fragment useful for conditional query building:

```typescript
const filter = userId ? sql`WHERE author_id = ${userId}` : sql.empty;
```

**Trade-offs:**

- Raw SQL bypasses Drizzle's type inference — selected columns are typed by your generic assertion, not the schema
- `db.execute()` returns driver-specific result shapes — PostgreSQL returns `{ rows, rowCount }`, MySQL returns different shapes
- Mixing raw SQL with the query builder works but requires careful column reference handling

## Source

https://orm.drizzle.team/docs/sql
