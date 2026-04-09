# Prisma Raw Queries

> Execute type-safe raw SQL with $queryRaw, $executeRaw, and Prisma.sql template tag

## When to Use

- Running SQL queries that Prisma Client cannot express (CTEs, window functions, complex joins)
- Performing bulk operations more efficiently than Prisma's generated queries
- Calling database-specific features (full-text search, advisory locks, lateral joins)
- Executing data migrations or one-off scripts

## Instructions

1. **Read query** — use `$queryRaw` with a tagged template literal. Always parameterize inputs:

```typescript
const users = await prisma.$queryRaw<User[]>`
  SELECT id, email, name FROM "User" WHERE role = ${role}
`;
```

The template tag automatically parameterizes `${role}` as a prepared statement parameter — never string-interpolated.

2. **Write query** — use `$executeRaw` for INSERT, UPDATE, DELETE. Returns the affected row count:

```typescript
const count = await prisma.$executeRaw`
  UPDATE "Post" SET "viewCount" = "viewCount" + 1 WHERE id = ${postId}
`;
```

3. **Dynamic table or column names** — use `Prisma.raw()` for identifiers that cannot be parameterized:

```typescript
import { Prisma } from '@prisma/client';

const column = Prisma.raw(`"${columnName}"`);
const result = await prisma.$queryRaw`
  SELECT ${column} FROM "User" WHERE id = ${userId}
`;
```

Validate `columnName` against an allowlist before using `Prisma.raw()` to prevent SQL injection.

4. **Build dynamic queries** with `Prisma.sql` and `Prisma.join`:

```typescript
const ids = [1, 2, 3];
const result = await prisma.$queryRaw`
  SELECT * FROM "User" WHERE id IN (${Prisma.join(ids)})
`;
```

5. **Compose query fragments** with `Prisma.sql`:

```typescript
const where = searchTerm ? Prisma.sql`WHERE name ILIKE ${'%' + searchTerm + '%'}` : Prisma.empty;

const users = await prisma.$queryRaw`SELECT * FROM "User" ${where}`;
```

6. **Type the result** — `$queryRaw` returns `unknown[]` by default. Pass a generic type or validate with Zod:

```typescript
import { z } from 'zod';

const UserRow = z.object({ id: z.string(), email: z.string() });
const raw = await prisma.$queryRaw`SELECT id, email FROM "User"`;
const users = z.array(UserRow).parse(raw);
```

7. **Use raw queries inside transactions**:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`LOCK TABLE "Inventory" IN EXCLUSIVE MODE`;
  const [item] = await tx.$queryRaw<Inventory[]>`
    SELECT * FROM "Inventory" WHERE sku = ${sku} FOR UPDATE
  `;
  await tx.$executeRaw`
    UPDATE "Inventory" SET quantity = quantity - ${qty} WHERE sku = ${sku}
  `;
});
```

## Details

Raw queries bypass Prisma's query engine and type generation. The SQL runs directly against the database connection, but parameter binding still uses prepared statements for safety.

**Table and column naming:** Prisma maps model names to table names via `@@map` and field names to column names via `@map`. In raw SQL, you must use the actual database names, not the Prisma model names. Check with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` to see the real table names.

**Return type caveats:**

- `$queryRaw` returns rows with exact database column names (not Prisma field names)
- `BigInt` columns return JavaScript `BigInt`, which is not JSON-serializable — convert to `Number` or `String` before sending to clients
- `Decimal` columns return `Prisma.Decimal` objects, not `number`
- `DateTime` columns return `Date` objects

**`$queryRawUnsafe` / `$executeRawUnsafe`:** Accept a plain string instead of a tagged template. These do NOT parameterize — you are responsible for preventing SQL injection. Avoid unless you are building a query builder that handles parameterization itself.

**Performance advantages of raw SQL:**

- CTEs and window functions are impossible with Prisma Client but often the most efficient solution
- `INSERT ... ON CONFLICT` (upsert) on multiple rows is significantly faster than looping `prisma.model.upsert()`
- Bulk updates with CASE expressions are faster than individual `update` calls

## Source

https://prisma.io/docs/orm/prisma-client/queries/raw-database-access

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
